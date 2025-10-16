/**
 * AnalyticsClient - Handles analytics and reporting
 * Based on the current analytics API patterns from the platform
 */

import {
    DecisionData,
    SpendData,
    ToolCallData,
    DecisionFilters,
    ToolCallFilters,
    UsageFilters,
    UsageRecord,
    GovernsAIConfig
} from './types';
import {
    AnalyticsError,
    createAnalyticsError,
    withRetry,
    RetryConfig
} from './errors';
import { HTTPClient, defaultLogger, Logger, buildQueryString } from './utils';

export class AnalyticsClient {
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
    // Decision Analytics
    // ============================================================================

    /**
     * Get decision analytics with optional filtering
     */
    async getDecisions(filters: DecisionFilters = {}): Promise<DecisionData> {
        this.logger.debug('Fetching decision analytics', filters);

        try {
            const queryParams = buildQueryString(filters);
            const response = await this.withRetry(
                () => this.httpClient.get<DecisionData>(`/api/v1/decisions${queryParams}`),
                'get decision analytics'
            );

            this.logger.debug('Decision analytics retrieved', {
                total: response.stats.total,
                byDecision: response.stats.byDecision
            });

            return response;
        } catch (error) {
            this.logger.error('Failed to fetch decision analytics', error);
            throw createAnalyticsError(
                `Failed to fetch decision analytics: ${error instanceof Error ? error instanceof Error ? error.message : "Unknown error" : 'Unknown error'}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get decision statistics for a time period
     */
    async getDecisionStats(timeRange: string = '30d'): Promise<{
        total: number;
        byDecision: Record<string, number>;
        byDirection: Record<string, number>;
        byTool: Record<string, number>;
    }> {
        this.logger.debug('Fetching decision statistics', { timeRange });

        try {
            const queryParams = buildQueryString({ timeRange, includeStats: true });
            const response = await this.withRetry(
                () => this.httpClient.get<DecisionData>(`/api/v1/decisions${queryParams}`),
                'get decision statistics'
            );

            this.logger.debug('Decision statistics retrieved', {
                total: response.stats.total,
                decisionCount: Object.keys(response.stats.byDecision).length
            });

            return response.stats;
        } catch (error) {
            this.logger.error('Failed to fetch decision statistics', error);
            throw createAnalyticsError(
                `Failed to fetch decision statistics: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    // ============================================================================
    // Tool Call Analytics
    // ============================================================================

    /**
     * Get tool call analytics with optional filtering
     */
    async getToolCalls(filters: ToolCallFilters = {}): Promise<ToolCallData> {
        this.logger.debug('Fetching tool call analytics', filters);

        try {
            const queryParams = buildQueryString(filters);
            const response = await this.withRetry(
                () => this.httpClient.get<ToolCallData>(`/api/v1/toolcalls${queryParams}`),
                'get tool call analytics'
            );

            this.logger.debug('Tool call analytics retrieved', {
                total: response.stats.total,
                byTool: response.stats.byTool
            });

            return response;
        } catch (error) {
            this.logger.error('Failed to fetch tool call analytics', error);
            throw createAnalyticsError(
                `Failed to fetch tool call analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get tool usage statistics
     */
    async getToolUsageStats(timeRange: string = '30d'): Promise<{
        total: number;
        byTool: Record<string, number>;
        byStatus: Record<string, number>;
    }> {
        this.logger.debug('Fetching tool usage statistics', { timeRange });

        try {
            const response = await this.getToolCalls({ timeRange, includeStats: true });

            this.logger.debug('Tool usage statistics retrieved', {
                total: response.stats.total,
                toolCount: Object.keys(response.stats.byTool).length
            });

            return response.stats;
        } catch (error) {
            this.logger.error('Failed to fetch tool usage statistics', error);
            throw createAnalyticsError(
                `Failed to fetch tool usage statistics: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    // ============================================================================
    // Spend Analytics
    // ============================================================================

    /**
     * Get spend analytics for a time period
     */
    async getSpendAnalytics(timeRange: string = '30d'): Promise<SpendData> {
        this.logger.debug('Fetching spend analytics', { timeRange });

        try {
            const queryParams = buildQueryString({ timeRange });
            const response = await this.withRetry(
                () => this.httpClient.get<SpendData>(`/api/v1/spend${queryParams}`),
                'get spend analytics'
            );

            this.logger.debug('Spend analytics retrieved', {
                totalSpend: response.spend.totalSpend,
                monthlySpend: response.spend.monthlySpend,
                isOverBudget: response.spend.isOverBudget
            });

            return response;
        } catch (error) {
            this.logger.error('Failed to fetch spend analytics', error);
            throw createAnalyticsError(
                `Failed to fetch spend analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get spend breakdown by tool
     */
    async getSpendByTool(timeRange: string = '30d'): Promise<Record<string, number>> {
        this.logger.debug('Fetching spend by tool', { timeRange });

        try {
            const queryParams = buildQueryString({ timeRange });
            const response = await this.withRetry(
                () => this.httpClient.get<{ costs: Record<string, number> }>(`/api/v1/spend/tool-costs${queryParams}`),
                'get spend by tool'
            );

            this.logger.debug('Spend by tool retrieved', {
                toolCount: Object.keys(response.costs).length
            });

            return response.costs;
        } catch (error) {
            this.logger.error('Failed to fetch spend by tool', error);
            throw createAnalyticsError(
                `Failed to fetch spend by tool: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get spend breakdown by model
     */
    async getSpendByModel(timeRange: string = '30d'): Promise<Record<string, number>> {
        this.logger.debug('Fetching spend by model', { timeRange });

        try {
            const queryParams = buildQueryString({ timeRange });
            const response = await this.withRetry(
                () => this.httpClient.get<{ costs: Record<string, number> }>(`/api/v1/spend/model-costs${queryParams}`),
                'get spend by model'
            );

            this.logger.debug('Spend by model retrieved', {
                modelCount: Object.keys(response.costs).length
            });

            return response.costs;
        } catch (error) {
            this.logger.error('Failed to fetch spend by model', error);
            throw createAnalyticsError(
                `Failed to fetch spend by model: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get spend breakdown by user
     */
    async getSpendByUser(timeRange: string = '30d'): Promise<Record<string, number>> {
        this.logger.debug('Fetching spend by user', { timeRange });

        try {
            const spendData = await this.getSpendAnalytics(timeRange);
            return spendData.spend.userSpend;
        } catch (error) {
            this.logger.error('Failed to fetch spend by user', error);
            throw createAnalyticsError(
                `Failed to fetch spend by user: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    // ============================================================================
    // Usage Analytics
    // ============================================================================

    /**
     * Get usage records with optional filtering
     */
    async getUsageRecords(filters: UsageFilters = {}): Promise<UsageRecord[]> {
        this.logger.debug('Fetching usage records', filters);

        try {
            const queryParams = buildQueryString(filters);
            const response = await this.withRetry(
                () => this.httpClient.get<{ records: UsageRecord[] }>(`/api/v1/usage${queryParams}`),
                'get usage records'
            );

            this.logger.debug('Usage records retrieved', { count: response.records.length });
            return response.records;
        } catch (error) {
            this.logger.error('Failed to fetch usage records', error);
            throw createAnalyticsError(
                `Failed to fetch usage records: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get usage statistics for a time period
     */
    async getUsageStats(timeRange: string = '30d'): Promise<{
        totalRecords: number;
        totalCost: number;
        averageCost: number;
        byTool: Record<string, number>;
        byModel: Record<string, number>;
        byUser: Record<string, number>;
    }> {
        this.logger.debug('Fetching usage statistics', { timeRange });

        try {
            const records = await this.getUsageRecords({
                startDate: this.getStartDate(timeRange),
                endDate: new Date().toISOString()
            });

            const totalCost = records.reduce((sum, record) => sum + record.cost, 0);
            const averageCost = records.length > 0 ? totalCost / records.length : 0;

            const byTool: Record<string, number> = {};
            const byModel: Record<string, number> = {};
            const byUser: Record<string, number> = {};

            records.forEach(record => {
                if (record.tool) {
                    byTool[record.tool] = (byTool[record.tool] || 0) + record.cost;
                }
                if (record.model) {
                    byModel[record.model] = (byModel[record.model] || 0) + record.cost;
                }
                if (record.userId) {
                    byUser[record.userId] = (byUser[record.userId] || 0) + record.cost;
                }
            });

            this.logger.debug('Usage statistics calculated', {
                totalRecords: records.length,
                totalCost,
                averageCost
            });

            return {
                totalRecords: records.length,
                totalCost,
                averageCost,
                byTool,
                byModel,
                byUser,
            };
        } catch (error) {
            this.logger.error('Failed to calculate usage statistics', error);
            throw createAnalyticsError(
                `Failed to calculate usage statistics: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    // ============================================================================
    // Dashboard Analytics
    // ============================================================================

    /**
     * Get comprehensive dashboard data
     */
    async getDashboardData(orgSlug: string, timeRange: string = '30d'): Promise<{
        decisions: DecisionData;
        toolCalls: ToolCallData;
        spend: SpendData;
        usage: {
            totalRecords: number;
            totalCost: number;
            averageCost: number;
        };
    }> {
        this.logger.debug('Fetching dashboard data', { orgSlug, timeRange });

        try {
            const [decisions, toolCalls, spend, usageStats] = await Promise.all([
                this.getDecisions({ timeRange, includeStats: true }),
                this.getToolCalls({ timeRange, includeStats: true }),
                this.getSpendAnalytics(timeRange),
                this.getUsageStats(timeRange),
            ]);

            this.logger.debug('Dashboard data retrieved successfully', {
                decisions: decisions.stats.total,
                toolCalls: toolCalls.stats.total,
                spend: spend.spend.totalSpend,
                usage: usageStats.totalRecords
            });

            return {
                decisions,
                toolCalls,
                spend,
                usage: {
                    totalRecords: usageStats.totalRecords,
                    totalCost: usageStats.totalCost,
                    averageCost: usageStats.averageCost,
                },
            };
        } catch (error) {
            this.logger.error('Failed to fetch dashboard data', error);
            throw createAnalyticsError(
                `Failed to fetch dashboard data: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get user profile and organizations
     */
    async getUserProfile(): Promise<{
        id: string;
        email: string;
        name: string;
        organizations: Array<{
            id: string;
            name: string;
            slug: string;
            role: string;
        }>;
    }> {
        this.logger.debug('Fetching user profile');

        try {
            const response = await this.withRetry(
                () => this.httpClient.get('/api/v1/profile'),
                'get user profile'
            );

            this.logger.debug('User profile retrieved', {
                userId: response.id,
                email: response.email,
                orgCount: response.organizations.length
            });

            return response;
        } catch (error) {
            this.logger.error('Failed to fetch user profile', error);
            throw createAnalyticsError(
                `Failed to fetch user profile: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Get start date for a time range
     */
    private getStartDate(timeRange: string): string {
        const now = new Date();
        let startDate: Date;

        switch (timeRange) {
            case '1h':
                startDate = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '24h':
            case '1d':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            case '1y':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        return startDate.toISOString();
    }

    /**
     * Format analytics data for display
     */
    formatAnalyticsData(data: any): any {
        // Format numbers to 2 decimal places
        if (typeof data === 'number') {
            return Math.round(data * 100) / 100;
        }

        // Recursively format objects
        if (typeof data === 'object' && data !== null) {
            if (Array.isArray(data)) {
                return data.map(item => this.formatAnalyticsData(item));
            } else {
                const formatted: any = {};
                for (const [key, value] of Object.entries(data)) {
                    formatted[key] = this.formatAnalyticsData(value);
                }
                return formatted;
            }
        }

        return data;
    }

    /**
     * Export analytics data to CSV format
     */
    exportToCSV(data: any[], _filename: string): string {
        if (data.length === 0) {
            return '';
        }

        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];

        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header];
                return typeof value === 'string' ? `"${value}"` : value;
            });
            csvRows.push(values.join(','));
        }

        return csvRows.join('\n');
    }

    // ============================================================================
    // Retry Logic
    // ============================================================================

    private async withRetry<T>(
        operation: () => Promise<T>,
        context: string = 'analytics operation'
    ): Promise<T> {
        const retryConfig: RetryConfig = {
            maxRetries: this.config.retries || 3,
            retryDelay: this.config.retryDelay || 1000,
            retryCondition: (error) => {
                if (error instanceof AnalyticsError) {
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
     * Get analytics service status
     */
    async getServiceStatus(): Promise<{
        available: boolean;
        responseTime?: number;
        lastError?: string;
    }> {
        const startTime = Date.now();

        try {
            await this.httpClient.get('/api/v1/decisions');
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
     * Test analytics service with a simple request
     */
    async testAnalytics(): Promise<boolean> {
        try {
            await this.getDecisions({ limit: 1 });
            return true;
        } catch (error) {
            this.logger.error('Analytics test failed', error);
            return false;
        }
    }
}
