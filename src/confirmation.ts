/**
 * ConfirmationClient - Handles user approval workflows for sensitive operations
 * Based on the current confirmation API patterns from the platform
 */

import {
    ConfirmationRequest,
    ConfirmationResponse,
    ConfirmationStatus,
    GovernsAIConfig
} from './types';
import {
    ConfirmationError,
    createConfirmationError,
    withRetry,
    RetryConfig
} from './errors';
import { HTTPClient, defaultLogger, Logger, sleep } from './utils';

export class ConfirmationClient {
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
    // Core Confirmation Methods
    // ============================================================================

    /**
     * Create a new confirmation request
     */
    async createConfirmation(request: ConfirmationRequest): Promise<ConfirmationResponse> {
        this.logger.debug('Creating confirmation', {
            correlationId: request.correlationId,
            requestType: request.requestType
        });

        try {
            const response = await this.withRetry(
                () => this.httpClient.post<ConfirmationResponse>('/api/v1/confirmation/create', request),
                'create confirmation'
            );

            this.logger.info('Confirmation created', {
                correlationId: request.correlationId,
                confirmationId: response.confirmation.id
            });

            return response;
        } catch (error) {
            this.logger.error('Failed to create confirmation', error);
            throw createConfirmationError(
                `Failed to create confirmation: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get confirmation status by correlation ID
     */
    async getConfirmationStatus(correlationId: string): Promise<ConfirmationStatus> {
        this.logger.debug('Getting confirmation status', { correlationId });

        try {
            const response = await this.withRetry(
                () => this.httpClient.get<ConfirmationStatus>(`/api/v1/confirmation/${correlationId}`),
                'get confirmation status'
            );

            this.logger.debug('Confirmation status retrieved', {
                correlationId,
                status: response.confirmation.status
            });

            return response;
        } catch (error) {
            this.logger.error('Failed to get confirmation status', error);
            throw createConfirmationError(
                `Failed to get confirmation status: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Approve a confirmation (if you have the necessary permissions)
     */
    async approveConfirmation(correlationId: string): Promise<void> {
        this.logger.debug('Approving confirmation', { correlationId });

        try {
            await this.withRetry(
                () => this.httpClient.post(`/api/v1/confirmation/${correlationId}/approve`),
                'approve confirmation'
            );

            this.logger.info('Confirmation approved', { correlationId });
        } catch (error) {
            this.logger.error('Failed to approve confirmation', error);
            throw createConfirmationError(
                `Failed to approve confirmation: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Cancel a confirmation
     */
    async cancelConfirmation(correlationId: string): Promise<void> {
        this.logger.debug('Canceling confirmation', { correlationId });

        try {
            await this.withRetry(
                () => this.httpClient.post(`/api/v1/confirmation/cancel`, { correlationId }),
                'cancel confirmation'
            );

            this.logger.info('Confirmation canceled', { correlationId });
        } catch (error) {
            this.logger.error('Failed to cancel confirmation', error);
            throw createConfirmationError(
                `Failed to cancel confirmation: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Poll for confirmation status changes
     */
    async pollConfirmation(
        correlationId: string,
        callback: (status: string) => void,
        interval: number = 2000,
        timeout: number = 300000
    ): Promise<void> {
        this.logger.debug('Starting confirmation polling', {
            correlationId,
            interval,
            timeout
        });

        const startTime = Date.now();
        const maxDuration = timeout;

        while (Date.now() - startTime < maxDuration) {
            try {
                const status = await this.getConfirmationStatus(correlationId);
                const currentStatus = status.confirmation.status as "pending" | "approved" | "denied" | "expired";

                this.logger.debug('Confirmation status update', {
                    correlationId,
                    status: currentStatus
                });

                callback(currentStatus);

                // Check if confirmation is in a final state
                if (this.isFinalStatus(currentStatus)) {
                    this.logger.info('Confirmation reached final status', {
                        correlationId,
                        status: currentStatus
                    });
                    return;
                }

                // Wait before next poll
                await sleep(interval);
            } catch (error) {
                this.logger.error('Error during confirmation polling', error);

                // Continue polling unless it's a non-retryable error
                if (error instanceof ConfirmationError && !error.retryable) {
                    throw error;
                }

                // Wait before retrying
                await sleep(interval);
            }
        }

        throw createConfirmationError(
            `Confirmation polling timed out after ${timeout}ms`,
            undefined,
            undefined
        );
    }

    /**
     * Wait for confirmation approval with automatic polling
     */
    async waitForApproval(
        correlationId: string,
        options: {
            interval?: number;
            timeout?: number;
            onStatusChange?: (status: string) => void;
        } = {}
    ): Promise<ConfirmationStatus> {
        const { interval = 2000, timeout = 300000, onStatusChange } = options;

        this.logger.debug('Waiting for confirmation approval', {
            correlationId,
            interval,
            timeout
        });

        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const maxDuration = timeout;

            const poll = async () => {
                try {
                    const status = await this.getConfirmationStatus(correlationId);
                    const currentStatus = status.confirmation.status as "pending" | "approved" | "denied" | "expired";

                    if (onStatusChange) {
                        onStatusChange(currentStatus);
                    }

                    if (currentStatus === 'approved') {
                        resolve(status);
                        return;
                    }

                    if (this.isFinalStatus(currentStatus as string) && (currentStatus as string) !== 'approved') {
                        reject(createConfirmationError(
                            `Confirmation was ${currentStatus} instead of approved`
                        ));
                        return;
                    }

                    if (Date.now() - startTime >= maxDuration) {
                        reject(createConfirmationError(
                            `Confirmation approval timed out after ${timeout}ms`
                        ));
                        return;
                    }

                    setTimeout(poll, interval);
                } catch (error) {
                    reject(error);
                }
            };

            poll();
        });
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Check if a status is final (no more changes expected)
     */
    isFinalStatus(status: string): boolean {
        return ['approved', 'denied', 'expired', 'cancelled'].includes(status);
    }

    /**
     * Check if a confirmation is approved
     */
    isApproved(status: string): boolean {
        return status === 'approved';
    }

    /**
     * Check if a confirmation is denied
     */
    isDenied(status: string): boolean {
        return status === 'denied';
    }

    /**
     * Check if a confirmation is expired
     */
    isExpired(status: string): boolean {
        return status === 'expired';
    }

    /**
     * Check if a confirmation is pending
     */
    isPending(status: string): boolean {
        return status === 'pending';
    }

    /**
     * Get confirmation URL for user interaction
     */
    getConfirmationUrl(correlationId: string): string {
        return `${this.config.baseUrl}/confirm/${correlationId}`;
    }

    /**
     * Create a confirmation request for tool calls
     */
    createToolCallConfirmation(
        correlationId: string,
        toolName: string,
        args: Record<string, any>,
        reasons?: string[]
    ): ConfirmationRequest {
        return {
            correlationId,
            requestType: 'tool_call',
            requestDesc: `Execute tool: ${toolName}`,
            requestPayload: { tool: toolName, args },
            decision: 'confirm',
            reasons: reasons || ['High risk operation'],
        };
    }

    /**
     * Create a confirmation request for chat messages
     */
    createChatConfirmation(
        correlationId: string,
        messageCount: number,
        provider: string,
        reasons?: string[]
    ): ConfirmationRequest {
        return {
            correlationId,
            requestType: 'chat',
            requestDesc: `Chat request with ${messageCount} message(s) using ${provider}`,
            requestPayload: { messageCount, provider },
            decision: 'confirm',
            reasons: reasons || ['Sensitive content detected'],
        };
    }

    /**
     * Create a confirmation request for MCP calls
     */
    createMCPConfirmation(
        correlationId: string,
        toolName: string,
        args: Record<string, any>,
        reasons?: string[]
    ): ConfirmationRequest {
        return {
            correlationId,
            requestType: 'mcp',
            requestDesc: `MCP call: ${toolName}`,
            requestPayload: { tool: toolName, args },
            decision: 'confirm',
            reasons: reasons || ['External tool access'],
        };
    }

    // ============================================================================
    // Batch Operations
    // ============================================================================

    /**
     * Create multiple confirmations
     */
    async createBatchConfirmations(requests: ConfirmationRequest[]): Promise<ConfirmationResponse[]> {
        this.logger.debug('Creating batch confirmations', { count: requests.length });

        const results: ConfirmationResponse[] = [];

        for (const request of requests) {
            try {
                const response = await this.createConfirmation(request);
                results.push(response);
            } catch (error) {
                this.logger.error('Batch confirmation creation failed', {
                    correlationId: request.correlationId,
                    error: error instanceof Error ? error.message : "Unknown error"
                });

                // Add error response to maintain order
                results.push({
                    success: false,
                    confirmation: {
                        id: '',
                        correlationId: request.correlationId,
                        requestType: request.requestType,
                        requestDesc: request.requestDesc,
                        decision: 'error',
                        reasons: [`Confirmation creation failed: ${error instanceof Error ? error.message : "Unknown error"}`],
                        status: 'error',
                        expiresAt: new Date().toISOString(),
                        createdAt: new Date().toISOString(),
                    }
                });
            }
        }

        return results;
    }

    /**
     * Poll multiple confirmations
     */
    async pollBatchConfirmations(
        correlationIds: string[],
        callback: (correlationId: string, status: string) => void,
        options: {
            interval?: number;
            timeout?: number;
        } = {}
    ): Promise<Map<string, ConfirmationStatus>> {
        const { interval = 2000, timeout = 300000 } = options;
        const results = new Map<string, ConfirmationStatus>();

        this.logger.debug('Polling batch confirmations', {
            count: correlationIds.length,
            interval,
            timeout
        });

        const startTime = Date.now();
        const maxDuration = timeout;

        while (Date.now() - startTime < maxDuration) {
            const pendingIds = correlationIds.filter(id => !results.has(id));

            if (pendingIds.length === 0) {
                break; // All confirmations resolved
            }

            for (const correlationId of pendingIds) {
                try {
                    const status = await this.getConfirmationStatus(correlationId);
                    const currentStatus = status.confirmation.status as "pending" | "approved" | "denied" | "expired";

                    callback(correlationId, currentStatus);

                    if (this.isFinalStatus(currentStatus)) {
                        results.set(correlationId, status);
                    }
                } catch (error) {
                    this.logger.error('Error polling confirmation', {
                        correlationId,
                        error: error instanceof Error ? error.message : "Unknown error"
                    });
                }
            }

            await sleep(interval);
        }

        return results;
    }

    // ============================================================================
    // Retry Logic
    // ============================================================================

    private async withRetry<T>(
        operation: () => Promise<T>,
        context: string = 'confirmation operation'
    ): Promise<T> {
        const retryConfig: RetryConfig = {
            maxRetries: this.config.retries || 3,
            retryDelay: this.config.retryDelay || 1000,
            retryCondition: (error) => {
                if (error instanceof ConfirmationError) {
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
     * Get confirmation service status
     */
    async getServiceStatus(): Promise<{
        available: boolean;
        responseTime?: number;
        lastError?: string;
    }> {
        const startTime = Date.now();

        try {
            await this.httpClient.get('/api/v1/confirmation');
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
     * Test confirmation service with a simple request
     */
    async testConfirmation(): Promise<boolean> {
        try {
            const testRequest: ConfirmationRequest = {
                correlationId: `test_${Date.now()}`,
                requestType: 'tool_call',
                requestDesc: 'Test confirmation',
                requestPayload: { test: true },
                decision: 'confirm',
                reasons: ['Test request'],
            };

            await this.createConfirmation(testRequest);
            return true;
        } catch (error) {
            this.logger.error('Confirmation test failed', error);
            return false;
        }
    }
}
