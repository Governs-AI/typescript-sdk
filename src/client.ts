/**
 * Main GovernsAI SDK Client
 * Central client that orchestrates all SDK functionality
 */

import { GovernsAIConfig, PrecheckRequest, PrecheckResponse, UsageRecord, BudgetContext } from './types';
import { GovernsAIError } from './errors';
import { HTTPClient, validateConfig, mergeConfig, defaultLogger, Logger, withRetry, RetryConfig } from './utils';
import { PrecheckClient } from './precheck';
import { ConfirmationClient } from './confirmation';
import { BudgetClient } from './budget';
import { ToolClient } from './tools';
import { AnalyticsClient } from './analytics';
import { ContextClient } from './memory';

export class GovernsAIClient {
    private httpClient: HTTPClient;
    private config: GovernsAIConfig;
    private logger: Logger;

    // Feature clients
    public readonly precheckClient: PrecheckClient;
    public readonly confirmationClient: ConfirmationClient;
    public readonly budgetClient: BudgetClient;
    public readonly toolsClient: ToolClient;
    public readonly analyticsClient: AnalyticsClient;
    public readonly context: ContextClient;

    constructor(config: GovernsAIConfig) {
        // Validate and merge configuration
        const mergedConfig = mergeConfig(
            {
                apiKey: config.apiKey,
                baseUrl: config.baseUrl,
                orgId: config.orgId,
                timeout: 30000,
                retries: 3,
                retryDelay: 1000,
            },
            config
        );

        validateConfig(mergedConfig);
        this.config = mergedConfig;
        this.logger = defaultLogger;

        // Initialize HTTP client
        this.httpClient = new HTTPClient(this.config);

        // Initialize feature clients
        this.precheckClient = new PrecheckClient(this.httpClient, this.config);
        this.confirmationClient = new ConfirmationClient(this.httpClient, this.config);
        this.budgetClient = new BudgetClient(this.httpClient, this.config);
        this.toolsClient = new ToolClient(this.httpClient, this.config);
        this.analyticsClient = new AnalyticsClient(this.httpClient, this.config);
        this.context = new ContextClient(this.httpClient, this.config);
    }

    // ============================================================================
    // Core SDK Methods
    // ============================================================================

    /**
     * Precheck a request for governance compliance (spec name: precheck)
     */
    async precheck(request: PrecheckRequest, userId: string): Promise<PrecheckResponse> {
        this.logger.debug('Prechecking request', { tool: request.tool, scope: request.scope, userId });
        return this.precheckClient.checkRequest(request, userId);
    }

    /**
     * Back-compat alias used by consumers
     */
    async precheckRequest(request: PrecheckRequest, userId: string): Promise<PrecheckResponse> {
        return this.precheck(request, userId);
    }

    /**
     * Get budget context for a specific user
     */
    async getBudgetContext(userId: string): Promise<BudgetContext> {
        this.logger.debug('Fetching budget context', { userId });
        return this.budgetClient.getBudgetContext(userId);
    }

    /**
     * Record usage after an AI operation
     */
    async recordUsage(usage: UsageRecord): Promise<void> {
        this.logger.debug('Recording usage', {
            model: usage.model,
            cost: usage.cost,
            tool: usage.tool
        });
        return this.budgetClient.recordUsage(usage);
    }

    /**
     * Create a confirmation request for sensitive operations
     */
    async confirm(
        correlationId: string,
        requestType: 'tool_call' | 'chat' | 'mcp',
        requestDesc: string,
        requestPayload: any,
        reasons?: string[]
    ) {
        this.logger.debug('Creating confirmation', { correlationId, requestType });
        return this.confirmationClient.createConfirmation({
            correlationId,
            requestType,
            requestDesc,
            requestPayload,
            reasons: reasons || [],
        });
    }

    // Policies
    async getPolicies(): Promise<any> {
        this.logger.debug('Fetching policies');
        return this.httpClient.get('/api/v1/policies');
    }

    // Memory Shortcuts
    async searchContext(input: { query: string; userId?: string; limit?: number; scope?: 'user' | 'org' | 'both' }) {
        return this.context.searchContext(input);
    }

    async getRecentContext(input: { userId?: string; limit?: number; scope?: 'user' | 'org' }) {
        return this.context.getRecentContext(input);
    }

    /**
     * Get confirmation status
     */
    async getConfirmationStatus(correlationId: string) {
        this.logger.debug('Getting confirmation status', { correlationId });
        return this.confirmationClient.getConfirmationStatus(correlationId);
    }

    /**
     * Poll for confirmation approval
     */
    async pollConfirmation(
        correlationId: string,
        callback: (status: string) => void,
        interval: number = 2000,
        timeout: number = 300000
    ): Promise<void> {
        this.logger.debug('Polling confirmation', { correlationId, interval, timeout });
        return this.confirmationClient.pollConfirmation(correlationId, callback, interval, timeout);
    }

    // ============================================================================
    // Utility Methods
    // ============================================================================

    /**
     * Update client configuration
     */
    updateConfig(newConfig: Partial<GovernsAIConfig>): void {
        const mergedConfig = mergeConfig(this.config, newConfig);
        validateConfig(mergedConfig);
        this.config = mergedConfig;

        // Recreate HTTP client with new config
        this.httpClient = new HTTPClient(this.config);

        // Update all feature clients
        this['precheckClient'].updateConfig(this.config);
        this['confirmationClient'].updateConfig(this.config);
        this['budgetClient'].updateConfig(this.config);
        this['toolsClient'].updateConfig(this.config);
        this['analyticsClient'].updateConfig(this.config);
        this['context'].updateConfig(this.config);

        // reassign http client on feature clients if needed
        (this['precheckClient'] as any)['httpClient'] = this.httpClient;
        (this['confirmationClient'] as any)['httpClient'] = this.httpClient;
        (this['budgetClient'] as any)['httpClient'] = this.httpClient;
        (this['toolsClient'] as any)['httpClient'] = this.httpClient;
        (this['analyticsClient'] as any)['httpClient'] = this.httpClient;
        (this['context'] as any)['httpClient'] = this.httpClient;
    }

    /**
     * Get current configuration
     */
    getConfig(): GovernsAIConfig {
        return { ...this.config };
    }

    /**
     * Set custom logger
     */
    setLogger(logger: Logger): void {
        this.logger = logger;
    }

    /**
     * Test connection to the platform
     */
    async testConnection(): Promise<boolean> {
        try {
            this.logger.debug('Testing connection to platform');
            await this.httpClient.get('/api/profile');
            this.logger.info('Connection test successful');
            return true;
        } catch (error) {
            this.logger.error('Connection test failed', error);
            return false;
        }
    }

    /**
     * Get platform health status
     */
    async getHealthStatus(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        services: Record<string, boolean>;
        timestamp: string;
    }> {
        const services: Record<string, boolean> = {};
        const timestamp = new Date().toISOString();

        try {
            // Test core services
            services['precheck'] = await this.testPrecheckService();
            services['confirmation'] = await this.testConfirmationService();
            services['budget'] = await this.testBudgetService();
            services['analytics'] = await this.testAnalyticsService();

            const healthyCount = Object.values(services).filter(Boolean).length;
            const totalCount = Object.keys(services).length;

            let status: 'healthy' | 'degraded' | 'unhealthy';
            if (healthyCount === totalCount) {
                status = 'healthy';
            } else if (healthyCount > 0) {
                status = 'degraded';
            } else {
                status = 'unhealthy';
            }

            return { status, services, timestamp };
        } catch (error) {
            this.logger.error('Health check failed', error);
            return {
                status: 'unhealthy',
                services,
                timestamp,
            };
        }
    }

    // ============================================================================
    // Private Helper Methods
    // ============================================================================

    private async testPrecheckService(): Promise<boolean> {
        try {
            await this.httpClient.get('/api/v1/precheck');
            return true;
        } catch {
            return false;
        }
    }

    private async testConfirmationService(): Promise<boolean> {
        try {
            await this.httpClient.get('/api/v1/confirmation');
            return true;
        } catch {
            return false;
        }
    }

    private async testBudgetService(): Promise<boolean> {
        try {
            await this.httpClient.get('/api/budget/context');
            return true;
        } catch {
            return false;
        }
    }

    private async testAnalyticsService(): Promise<boolean> {
        try {
            await this.httpClient.get('/api/decisions');
            return true;
        } catch {
            return false;
        }
    }

    // ============================================================================
    // Retry Configuration
    // ============================================================================

    /**
     * Execute operation with retry logic
     */
    async withRetry<T>(
        operation: () => Promise<T>,
        context: string = 'operation'
    ): Promise<T> {
        const retryConfig: RetryConfig = {
            maxRetries: this.config.retries || 3,
            retryDelay: this.config.retryDelay || 1000,
            retryCondition: (error: Error) => {
                if (error instanceof GovernsAIError) {
                    return error.retryable === true;
                }
                return false;
            },
        };

        return withRetry(operation, retryConfig, context);
    }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new GovernsAI client instance
 */
export function createClient(config: GovernsAIConfig): GovernsAIClient {
    return new GovernsAIClient(config);
}

/**
 * Create a client from environment variables
 */
export function createClientFromEnv(): GovernsAIClient {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = ((globalThis as any).process && (globalThis as any).process.env) || {};
    const config: GovernsAIConfig = {
        apiKey: env['GOVERNS_API_KEY'] || '',
        baseUrl: env['GOVERNS_BASE_URL'] || '',
        orgId: env['GOVERNS_ORG_ID'] || '',
    };
    if (env['GOVERNS_TIMEOUT']) {
        config.timeout = parseInt(env['GOVERNS_TIMEOUT']);
    }
    if (env['GOVERNS_RETRIES']) {
        config.retries = parseInt(env['GOVERNS_RETRIES']);
    }
    if (env['GOVERNS_RETRY_DELAY']) {
        config.retryDelay = parseInt(env['GOVERNS_RETRY_DELAY']);
    }

    if (!config.apiKey) {
        throw new GovernsAIError('GOVERNS_API_KEY environment variable is required');
    }
    if (!config.baseUrl) {
        throw new GovernsAIError('GOVERNS_BASE_URL environment variable is required');
    }
    if (!config.orgId) {
        throw new GovernsAIError('GOVERNS_ORG_ID environment variable is required');
    }

    return new GovernsAIClient(config as GovernsAIConfig);
}

// ============================================================================
// Default Export
// ============================================================================

export default GovernsAIClient;
