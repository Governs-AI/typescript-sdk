/**
 * PrecheckClient - Handles request validation and governance compliance
 * Based on the current precheck API patterns from the platform
 */

import {
    PrecheckRequest,
    PrecheckResponse,
    Message,
    GovernsAIConfig
} from './types';
import {
    PrecheckError,
    createPrecheckError,
    withRetry,
    RetryConfig
} from './errors';
import { HTTPClient, generateCorrelationId, defaultLogger, Logger } from './utils';

export class PrecheckClient {
    private httpClient: HTTPClient;
    private config: GovernsAIConfig;
    private logger: Logger;

    constructor(httpClient: HTTPClient, config: GovernsAIConfig) {
        this.httpClient = httpClient;
        this.config = config;
        this.logger = defaultLogger;
    }

    /**
     * Update client configuration
     */
    updateConfig(config: GovernsAIConfig): void {
        this.config = config;
    }

    // ============================================================================
    // Core Precheck Methods
    // ============================================================================

    /**
     * Check a request for governance compliance
     */
    async checkRequest(request: PrecheckRequest, userId?: string): Promise<PrecheckResponse> {
        this.logger.debug('Checking request', {
            tool: request.tool,
            scope: request.scope,
            correlationId: request.corr_id,
            userId
        });

        // Add userId to request if provided
        const requestWithUser = userId ? { ...request, userId } : request;

        try {
            const response = await this.withRetry(
                () => this.httpClient.post<PrecheckResponse>('/api/v1/precheck', requestWithUser),
                'precheck request'
            );

            this.logger.debug('Precheck response received', {
                decision: response.decision,
                reasons: response.reasons
            });

            return response;
        } catch (error) {
            this.logger.error('Precheck failed', error);
            throw createPrecheckError(
                `Precheck request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Check a tool call for governance compliance
     */
    async checkToolCall(
        tool: string,
        args: Record<string, any>,
        scope: string = 'net.external',
        correlationId?: string,
        userId?: string
    ): Promise<PrecheckResponse> {
        const request: PrecheckRequest = {
            tool,
            scope,
            raw_text: `Tool call: ${tool} with arguments: ${JSON.stringify(args)}`,
            payload: { tool, args },
            tags: ['sdk', 'tool_call'],
            corr_id: correlationId || generateCorrelationId(),
            ...(userId && { userId })
        };

        return this.checkRequest(request, userId);
    }

    /**
     * Check a chat message for governance compliance
     */
    async checkChatMessage(
        messages: Message[],
        provider: string = 'openai',
        correlationId?: string,
        userId?: string
    ): Promise<PrecheckResponse> {
        // Only send the last user message for precheck
        const lastUserMessage = messages
            .filter(msg => msg.role === 'user')
            .slice(-1)[0];

        const request: PrecheckRequest = {
            tool: 'model.chat',
            scope: 'net.external',
            raw_text: lastUserMessage?.content || '',
            payload: { messages, provider },
            tags: ['sdk', 'chat'],
            corr_id: correlationId || generateCorrelationId(),
            ...(userId && { userId })
        };

        return this.checkRequest(request, userId);
    }

    /**
     * Check an MCP (Model Context Protocol) call
     */
    async checkMCPCall(
        tool: string,
        args: Record<string, any>,
        scope: string = 'net.external',
        correlationId?: string,
        budgetContext?: any
    ): Promise<PrecheckResponse> {
        const request: PrecheckRequest = {
            tool,
            scope,
            raw_text: `MCP Tool Call: ${tool} with arguments: ${JSON.stringify(args)}`,
            payload: { tool, args },
            tags: ['sdk', 'mcp'],
            corr_id: correlationId || generateCorrelationId(),
            budget_context: budgetContext,
        };

        return this.checkRequest(request);
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Create a precheck request for chat messages
     */
    createChatPrecheckRequest(
        messages: Message[],
        provider: string,
        correlationId?: string,
        policyConfig?: any,
        toolConfig?: any
    ): PrecheckRequest {
        const lastUserMessage = messages
            .filter(msg => msg.role === 'user')
            .slice(-1)[0];

        return {
            tool: 'model.chat',
            scope: 'net.external',
            raw_text: lastUserMessage?.content || '',
            payload: { messages, provider },
            tags: ['sdk', 'chat'],
            corr_id: correlationId || generateCorrelationId(),
            policy_config: policyConfig,
            tool_config: toolConfig,
        };
    }

    /**
     * Create a precheck request for MCP calls
     */
    createMCPPrecheckRequest(
        tool: string,
        args: Record<string, any>,
        correlationId?: string,
        policyConfig?: any,
        toolConfig?: any,
        budgetContext?: any
    ): PrecheckRequest {
        // Extract purchase amount from args for payment tools
        let enhancedToolConfig = { ...toolConfig };
        if (tool === 'payment_process' && args['amount']) {
            enhancedToolConfig = {
                ...toolConfig,
                metadata: {
                    ...toolConfig?.metadata,
                    purchase_amount: Number(args['amount']),
                    amount: Number(args['amount']),
                    currency: args['currency'] || 'USD',
                    description: args['description'] || 'Payment transaction',
                }
            };
        }

        return {
            tool,
            scope: enhancedToolConfig?.scope || 'net.external',
            raw_text: `MCP Tool Call: ${tool} with arguments: ${JSON.stringify(args)}`,
            payload: { tool, args },
            tags: ['sdk', 'mcp'],
            corr_id: correlationId || generateCorrelationId(),
            policy_config: policyConfig,
            tool_config: enhancedToolConfig,
            budget_context: budgetContext,
        };
    }

    /**
     * Validate precheck response
     */
    validatePrecheckResponse(response: any): PrecheckResponse {
        if (!response || typeof response !== 'object') {
            throw createPrecheckError('Invalid precheck response format');
        }

        if (!response.decision) {
            throw createPrecheckError('Missing decision in precheck response');
        }

        const validDecisions = ['allow', 'deny', 'block', 'confirm', 'redact'];
        if (!validDecisions.includes(response.decision)) {
            throw createPrecheckError(`Invalid decision: ${response.decision}`);
        }

        return response as PrecheckResponse;
    }

    /**
     * Check if a decision requires confirmation
     */
    requiresConfirmation(decision: string): boolean {
        return decision === 'confirm';
    }

    /**
     * Check if a decision blocks the request
     */
    isBlocked(decision: string): boolean {
        return decision === 'block' || decision === 'deny';
    }

    /**
     * Check if a decision allows the request
     */
    isAllowed(decision: string): boolean {
        return decision === 'allow';
    }

    /**
     * Get user-friendly error message from precheck response
     */
    getUserFriendlyError(response: PrecheckResponse): string {
        if (!response.reasons || response.reasons.length === 0) {
            return 'Request blocked by policy';
        }

        // Filter out technical precheck service messages
        const cleanReasons = response.reasons.filter(reason =>
            !reason.includes('Precheck service') &&
            !reason.includes('connection failed') &&
            !reason.includes('service not available')
        );

        if (cleanReasons.length === 0) {
            return 'Request blocked by policy';
        }

        return cleanReasons.join(', ');
    }

    // ============================================================================
    // Batch Operations
    // ============================================================================

    /**
     * Check multiple requests in batch
     */
    async checkBatch(requests: PrecheckRequest[]): Promise<PrecheckResponse[]> {
        this.logger.debug('Checking batch of requests', { count: requests.length });

        const results: PrecheckResponse[] = [];

        for (const request of requests) {
            try {
                const response = await this.checkRequest(request);
                results.push(response);
            } catch (error) {
                this.logger.error('Batch precheck failed for request', {
                    tool: request.tool,
                    error: error instanceof Error ? error.message : "Unknown error"
                });

                // Add error response to maintain order
                results.push({
                    decision: 'block',
                    reasons: [`Precheck failed: ${error instanceof Error ? error.message : "Unknown error"}`],
                    metadata: { error: true, originalError: error instanceof Error ? error.message : "Unknown error" }
                });
            }
        }

        return results;
    }

    // ============================================================================
    // Retry Logic
    // ============================================================================

    private async withRetry<T>(
        operation: () => Promise<T>,
        context: string = 'precheck operation'
    ): Promise<T> {
        const retryConfig: RetryConfig = {
            maxRetries: this.config.retries || 3,
            retryDelay: this.config.retryDelay || 1000,
            retryCondition: (error) => {
                if (error instanceof PrecheckError) {
                    return error.retryable === true;
                }
                return false;
            },
        };

        return withRetry(operation, retryConfig, context);
    }

    // ============================================================================
    // Debug and Diagnostics
    // ============================================================================

    /**
     * Get precheck service status
     */
    async getServiceStatus(): Promise<{
        available: boolean;
        responseTime?: number;
        lastError?: string;
    }> {
        const startTime = Date.now();

        try {
            await this.httpClient.get('/api/v1/precheck');
            const responseTime = Date.now() - startTime;

            return {
                available: true,
                responseTime,
            };
        } catch (error) {
            return {
                available: false,
                lastError: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    /**
     * Test precheck with a simple request
     */
    async testPrecheck(): Promise<boolean> {
        try {
            const testRequest: PrecheckRequest = {
                tool: 'test.tool',
                scope: 'net.external',
                raw_text: 'Test message',
                tags: ['test'],
            };

            await this.checkRequest(testRequest);
            return true;
        } catch (error) {
            this.logger.error('Precheck test failed', error);
            return false;
        }
    }
}
