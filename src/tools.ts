/**
 * ToolClient - Handles tool management and execution
 * Based on the current tool API patterns from the platform
 */

import {
    Tool,
    ToolMetadata,
    ToolResult,
    ToolFilters,
    GovernsAIConfig
} from './types';
import {
    ToolError,
    createToolError,
    withRetry,
    RetryConfig
} from './errors';
import { HTTPClient, defaultLogger, Logger, buildQueryString } from './utils';

export class ToolClient {
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
    // Core Tool Methods
    // ============================================================================

    /**
     * Register tools with the platform
     */
    async registerTools(tools: Tool[], _userId?: string): Promise<void> {
        this.logger.debug('Registering tools', { count: tools.length });

        try {
            await this.withRetry(
                () => this.httpClient.post('/api/v1/tools', { tools }),
                'register tools'
            );

            this.logger.info('Tools registered successfully', { count: tools.length });
        } catch (error) {
            this.logger.error('Failed to register tools', error);
            throw createToolError(
                `Failed to register tools: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Register tools with metadata for auto-discovery
     */
    async registerToolsWithMetadata(tools: Tool[]): Promise<void> {
        this.logger.debug('Registering tools with metadata', { count: tools.length });

        try {
            await this.withRetry(
                () => this.httpClient.post('/api/agents/tools/register', { tools }),
                'register tools with metadata'
            );

            this.logger.info('Tools registered with metadata successfully', { count: tools.length });
        } catch (error) {
            this.logger.error('Failed to register tools with metadata', error);
            throw createToolError(
                `Failed to register tools with metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Register agent tools by name
     */
    async registerAgentTools(toolNames: string[]): Promise<void> {
        this.logger.debug('Registering agent tools', { count: toolNames.length });

        try {
            await this.withRetry(
                () => this.httpClient.post('/api/agents/tools', { toolNames }),
                'register agent tools'
            );

            this.logger.info('Agent tools registered successfully', { count: toolNames.length });
        } catch (error) {
            this.logger.error('Failed to register agent tools', error);
            throw createToolError(
                `Failed to register agent tools: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get tool metadata by name
     */
    async getToolMetadata(toolName: string): Promise<ToolMetadata | null> {
        this.logger.debug('Getting tool metadata', { toolName });

        try {
            const response = await this.withRetry(
                () => this.httpClient.get<{ metadata: ToolMetadata }>(`/api/tools/${toolName}/metadata`),
                'get tool metadata'
            );

            this.logger.debug('Tool metadata retrieved', {
                toolName,
                scope: response.metadata.scope,
                riskLevel: response.metadata.metadata.risk_level
            });

            return response.metadata;
        } catch (error) {
            this.logger.error('Failed to get tool metadata', error);
            throw createToolError(
                `Failed to get tool metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Execute a tool with governance checks
     */
    async executeTool(toolName: string, args: Record<string, any>): Promise<ToolResult> {
        this.logger.debug('Executing tool', { toolName, args });

        try {
            const response = await this.withRetry(
                () => this.httpClient.post<ToolResult>('/api/mcp', { tool: toolName, args }),
                'execute tool'
            );

            this.logger.debug('Tool execution completed', {
                toolName,
                success: response.success,
                hasData: !!response.data
            });

            return response;
        } catch (error) {
            this.logger.error('Tool execution failed', error);
            throw createToolError(
                `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * List available tools with optional filtering
     */
    async listTools(filters: ToolFilters = {}): Promise<Tool[]> {
        this.logger.debug('Listing tools', filters);

        try {
            const queryParams = buildQueryString(filters);
            const response = await this.withRetry(
                () => this.httpClient.get<{ tools: Tool[] }>(`/api/tools${queryParams}`),
                'list tools'
            );

            this.logger.debug('Tools listed successfully', { count: response.tools.length });
            return response.tools;
        } catch (error) {
            this.logger.error('Failed to list tools', error);
            throw createToolError(
                `Failed to list tools: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get agent tools
     */
    async getAgentTools(): Promise<string[]> {
        this.logger.debug('Getting agent tools');

        try {
            const response = await this.withRetry(
                () => this.httpClient.get<{ tools: string[] }>('/api/agents/tools'),
                'get agent tools'
            );

            this.logger.debug('Agent tools retrieved', { count: response.tools.length });
            return response.tools;
        } catch (error) {
            this.logger.error('Failed to get agent tools', error);
            throw createToolError(
                `Failed to get agent tools: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    // ============================================================================
    // Tool Configuration Management
    // ============================================================================

    /**
     * Create or update tool configuration
     */
    async createToolConfig(config: {
        toolName: string;
        scope: string;
        direction: 'ingress' | 'egress' | 'both';
        metadata: {
            category: string;
            risk_level: 'low' | 'medium' | 'high' | 'critical';
            requires_approval?: boolean;
        };
    }): Promise<ToolMetadata> {
        this.logger.debug('Creating tool configuration', { toolName: config.toolName });

        try {
            const response = await this.withRetry(
                () => this.httpClient.post<ToolMetadata>('/api/tools', config),
                'create tool configuration'
            );

            this.logger.info('Tool configuration created successfully', {
                toolName: config.toolName,
                riskLevel: config.metadata.risk_level
            });

            return response;
        } catch (error) {
            this.logger.error('Failed to create tool configuration', error);
            throw createToolError(
                `Failed to create tool configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Update tool configuration
     */
    async updateToolConfig(toolName: string, updates: Partial<ToolMetadata>): Promise<ToolMetadata> {
        this.logger.debug('Updating tool configuration', { toolName, updates });

        try {
            const response = await this.withRetry(
                () => this.httpClient.put<ToolMetadata>(`/api/tools/${toolName}`, updates),
                'update tool configuration'
            );

            this.logger.info('Tool configuration updated successfully', { toolName });
            return response;
        } catch (error) {
            this.logger.error('Failed to update tool configuration', error);
            throw createToolError(
                `Failed to update tool configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Delete tool configuration
     */
    async deleteToolConfig(toolName: string): Promise<void> {
        this.logger.debug('Deleting tool configuration', { toolName });

        try {
            await this.withRetry(
                () => this.httpClient.delete(`/api/tools/${toolName}`),
                'delete tool configuration'
            );

            this.logger.info('Tool configuration deleted successfully', { toolName });
        } catch (error) {
            this.logger.error('Failed to delete tool configuration', error);
            throw createToolError(
                `Failed to delete tool configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Get tool metadata from platform or fallback to local
     */
    getToolMetadataFromPlatform(
        toolName: string,
        platformToolMetadata: Record<string, ToolMetadata>
    ): ToolMetadata | null {
        return platformToolMetadata[toolName] || null;
    }


    /**
     * Validate tool arguments against tool schema
     */
    validateToolArguments(tool: Tool, args: Record<string, any>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const { parameters } = tool.function;

        // Check required parameters
        if (parameters.required) {
            for (const requiredParam of parameters.required) {
                if (!(requiredParam in args)) {
                    errors.push(`Missing required parameter: ${requiredParam}`);
                }
            }
        }

        // Check parameter types
        for (const [paramName, paramValue] of Object.entries(args)) {
            const paramSchema = parameters.properties[paramName];
            if (paramSchema) {
                const validationError = this.validateParameter(paramName, paramValue, paramSchema);
                if (validationError) {
                    errors.push(validationError);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Validate a single parameter against its schema
     */
    private validateParameter(
        paramName: string,
        value: any,
        schema: any
    ): string | null {
        if (schema.type === 'string' && typeof value !== 'string') {
            return `Parameter ${paramName} must be a string`;
        }
        if (schema.type === 'number' && typeof value !== 'number') {
            return `Parameter ${paramName} must be a number`;
        }
        if (schema.type === 'boolean' && typeof value !== 'boolean') {
            return `Parameter ${paramName} must be a boolean`;
        }
        if (schema.type === 'array' && !Array.isArray(value)) {
            return `Parameter ${paramName} must be an array`;
        }
        if (schema.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
            return `Parameter ${paramName} must be an object`;
        }

        return null;
    }

    /**
     * Get tools by category
     */
    async getToolsByCategory(category: string): Promise<Tool[]> {
        return this.listTools({ category });
    }

    /**
     * Get tools by risk level
     */
    async getToolsByRiskLevel(riskLevel: string): Promise<Tool[]> {
        return this.listTools({ risk_level: riskLevel });
    }

    /**
     * Get tools that require approval
     */
    async getToolsRequiringApproval(): Promise<Tool[]> {
        return this.listTools({ requires_approval: true });
    }

    // ============================================================================
    // Batch Operations
    // ============================================================================

    /**
     * Register multiple tools in batch
     */
    async registerBatchTools(tools: Tool[]): Promise<void> {
        this.logger.debug('Registering batch tools', { count: tools.length });

        for (const tool of tools) {
            try {
                await this.registerTools([tool]);
            } catch (error) {
                this.logger.error('Failed to register tool in batch', {
                    toolName: tool.function.name,
                    error: error instanceof Error ? error.message : "Unknown error"
                });
                // Continue with other tools even if one fails
            }
        }

        this.logger.info('Batch tool registration completed', { count: tools.length });
    }

    /**
     * Execute multiple tools in batch
     */
    async executeBatchTools(
        toolCalls: Array<{ tool: string; args: Record<string, any> }>
    ): Promise<ToolResult[]> {
        this.logger.debug('Executing batch tools', { count: toolCalls.length });

        const results: ToolResult[] = [];

        for (const toolCall of toolCalls) {
            try {
                const result = await this.executeTool(toolCall.tool, toolCall.args);
                results.push(result);
            } catch (error) {
                this.logger.error('Failed to execute tool in batch', {
                    tool: toolCall.tool,
                    error: error instanceof Error ? error.message : "Unknown error"
                });

                // Add error result to maintain order
                results.push({
                    success: false,
                    error: `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                });
            }
        }

        this.logger.info('Batch tool execution completed', { count: results.length });
        return results;
    }

    // ============================================================================
    // Retry Logic
    // ============================================================================

    private async withRetry<T>(
        operation: () => Promise<T>,
        context: string = 'tool operation'
    ): Promise<T> {
        const retryConfig: RetryConfig = {
            maxRetries: this.config.retries || 3,
            retryDelay: this.config.retryDelay || 1000,
            retryCondition: (error) => {
                if (error instanceof ToolError) {
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
     * Get tool service status
     */
    async getServiceStatus(): Promise<{
        available: boolean;
        responseTime?: number;
        lastError?: string;
    }> {
        const startTime = Date.now();

        try {
            await this.httpClient.get('/api/tools');
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
     * Test tool service with a simple request
     */
    async testTools(): Promise<boolean> {
        try {
            await this.listTools();
            return true;
        } catch (error) {
            this.logger.error('Tool test failed', error);
            return false;
        }
    }
}
