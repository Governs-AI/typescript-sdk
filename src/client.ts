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

export class GovernsAIClient {
    private httpClient: HTTPClient;
    private config: GovernsAIConfig;
    private logger: Logger;

    // Feature clients
    public readonly precheck: PrecheckClient;
    public readonly confirmation: ConfirmationClient;
    public readonly budget: BudgetClient;
    public readonly tools: ToolClient;
    public readonly analytics: AnalyticsClient;

    constructor(config: GovernsAIConfig) {
        // Validate and merge configuration
        const mergedConfig = mergeConfig(
            {
                apiKey: config.apiKey,
                baseUrl: 'http://localhost:3002',
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
        this.precheck = new PrecheckClient(this.httpClient, this.config);
        this.confirmation = new ConfirmationClient(this.httpClient, this.config);
        this.budget = new BudgetClient(this.httpClient, this.config);
        this.tools = new ToolClient(this.httpClient, this.config);
        this.analytics = new AnalyticsClient(this.httpClient, this.config);
    }

    // ============================================================================
    // Core SDK Methods
    // ============================================================================

    /**
     * Precheck a request for governance compliance
     */
    async precheckRequest(request: PrecheckRequest, userId: string): Promise<PrecheckResponse> {
        this.logger.debug('Prechecking request', { tool: request.tool, scope: request.scope, userId });
        return this.precheck.checkRequest(request, userId);
    }

    /**
     * Get budget context for a specific user
     */
    async getBudgetContext(userId: string): Promise<BudgetContext> {
        this.logger.debug('Fetching budget context', { userId });
        return this.budget.getBudgetContext(userId);
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
        return this.budget.recordUsage(usage);
    }

    /**
     * Create a confirmation request for sensitive operations
     */
    async createConfirmation(
        correlationId: string,
        requestType: 'tool_call' | 'chat' | 'mcp',
        requestDesc: string,
        requestPayload: any,
        reasons?: string[]
    ) {
        this.logger.debug('Creating confirmation', { correlationId, requestType });
        return this.confirmation.createConfirmation({
            correlationId,
            requestType,
            requestDesc,
            requestPayload,
            reasons: reasons || [],
        });
    }

    /**
     * Get confirmation status
     */
    async getConfirmationStatus(correlationId: string) {
        this.logger.debug('Getting confirmation status', { correlationId });
        return this.confirmation.getConfirmationStatus(correlationId);
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
        return this.confirmation.pollConfirmation(correlationId, callback, interval, timeout);
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
        this['precheck'].updateConfig(this.config);
        this['confirmation'].updateConfig(this.config);
        this['budget'].updateConfig(this.config);
        this['tools'].updateConfig(this.config);
        this['analytics'].updateConfig(this.config);
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
    const config: GovernsAIConfig = {
        apiKey: process.env['GOVERNS_API_KEY'] || '',
        baseUrl: process.env['GOVERNS_BASE_URL'] || 'http://localhost:3002',
        orgId: process.env['GOVERNS_ORG_ID'] || '',
    };
    if (process.env['GOVERNS_TIMEOUT']) {
        config.timeout = parseInt(process.env['GOVERNS_TIMEOUT']);
    }
    if (process.env['GOVERNS_RETRIES']) {
        config.retries = parseInt(process.env['GOVERNS_RETRIES']);
    }
    if (process.env['GOVERNS_RETRY_DELAY']) {
        config.retryDelay = parseInt(process.env['GOVERNS_RETRY_DELAY']);
    }

    if (!config.apiKey) {
        throw new GovernsAIError(
            'GOVERNS_API_KEY environment variable is required'
        );
    }

    return new GovernsAIClient(config as GovernsAIConfig);
}

// ============================================================================
// Default Export
// ============================================================================

export default GovernsAIClient;
