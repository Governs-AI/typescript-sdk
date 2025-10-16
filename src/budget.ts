/**
 * BudgetClient - Handles budget management and usage tracking
 * Based on the current budget API patterns from the platform
 */

import {
    BudgetContext,
    BudgetStatus,
    UsageRecord,
    PurchaseRecord,
    BudgetLimit,
    CreateBudgetLimitRequest,
    GovernsAIConfig
} from './types';
import {
    BudgetError,
    createBudgetError,
    withRetry,
    RetryConfig
} from './errors';
import { HTTPClient, defaultLogger, Logger, buildQueryString } from './utils';

export class BudgetClient {
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
    // Core Budget Methods
    // ============================================================================

    /**
     * Get budget context for a specific user
     */
    async getBudgetContext(_userId: string): Promise<BudgetContext> {
        this.logger.debug('Fetching budget context');

        try {
            const response = await this.withRetry(
                () => this.httpClient.get<BudgetContext>(`/api/v1/budget/context`),
                'get budget context'
            );

            this.logger.debug('Budget context retrieved', {
                monthlyLimit: response.monthly_limit,
                currentSpend: response.current_spend,
                remainingBudget: response.remaining_budget,
                budgetType: response.budget_type
            });

            return response;
        } catch (error) {
            this.logger.error('Failed to fetch budget context', error);
            throw createBudgetError(
                `Failed to fetch budget context: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Check if a budget allows a specific cost
     */
    async checkBudget(estimatedCost: number, userId: string): Promise<BudgetStatus> {
        this.logger.debug('Checking budget', { estimatedCost, userId });

        try {
            const context = await this.getBudgetContext(userId);

            const allowed = context.remaining_budget >= estimatedCost;
            const percentUsed = (context.current_spend / context.monthly_limit) * 100;

            const status: BudgetStatus = {
                allowed,
                currentSpend: context.current_spend,
                limit: context.monthly_limit,
                remaining: context.remaining_budget,
                percentUsed,
                ...(allowed ? {} : { reason: 'Insufficient budget remaining' })
            };

            this.logger.debug('Budget check completed', {
                allowed: status.allowed,
                remaining: status.remaining,
                estimatedCost
            });

            return status;
        } catch (error) {
            this.logger.error('Budget check failed', error);
            throw createBudgetError(
                `Budget check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Record usage after an AI operation
     */
    // Accepts legacy UsageRecord; maps to v1 payload
    async recordUsage(usage: any): Promise<void> {
        this.logger.debug('Recording usage', {
            model: usage?.model,
            cost: usage?.cost,
            tool: usage?.tool || usage?.toolId,
            correlationId: usage?.correlationId
        });

        try {
            const payload = {
                toolId: usage?.toolId || usage?.tool,
                model: usage?.model,
                tokensIn: usage?.tokensIn ?? usage?.inputTokens,
                tokensOut: usage?.tokensOut ?? usage?.outputTokens,
                cost: usage?.cost,
                metadata: usage?.metadata,
            };
            await this.withRetry(() => this.httpClient.post('/api/v1/usage', payload), 'record usage');

            this.logger.info('Usage recorded successfully', {
                model: usage.model,
                cost: usage.cost,
                tool: usage.tool
            });
        } catch (error) {
            this.logger.error('Failed to record usage', error);
            throw createBudgetError(
                `Failed to record usage: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Record a purchase transaction
     */
    async recordPurchase(purchase: PurchaseRecord): Promise<void> {
        this.logger.debug('Recording purchase', {
            amount: purchase.amount,
            currency: purchase.currency,
            description: purchase.description
        });

        try {
            await this.withRetry(
                () => this.httpClient.post('/api/purchases', purchase),
                'record purchase'
            );

            this.logger.info('Purchase recorded successfully', {
                amount: purchase.amount,
                currency: purchase.currency
            });
        } catch (error) {
            this.logger.error('Failed to record purchase', error);
            throw createBudgetError(
                `Failed to record purchase: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    // ============================================================================
    // Budget Limits Management
    // ============================================================================

    /**
     * Get budget limits for the organization
     */
    async getBudgetLimits(): Promise<BudgetLimit[]> {
        this.logger.debug('Fetching budget limits');

        try {
            const response = await this.withRetry(
                () => this.httpClient.get<{ limits: BudgetLimit[] }>('/api/spend/budget-limits'),
                'get budget limits'
            );

            this.logger.debug('Budget limits retrieved', { count: response.limits.length });
            return response.limits;
        } catch (error) {
            this.logger.error('Failed to fetch budget limits', error);
            throw createBudgetError(
                `Failed to fetch budget limits: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Create a new budget limit
     */
    async createBudgetLimit(request: CreateBudgetLimitRequest): Promise<BudgetLimit> {
        this.logger.debug('Creating budget limit', {
            orgId: request.orgId,
            userId: request.userId,
            monthlyLimit: request.monthlyLimit,
            type: request.type
        });

        try {
            const response = await this.withRetry(
                () => this.httpClient.post<BudgetLimit>('/api/spend/budget-limits', request),
                'create budget limit'
            );

            this.logger.info('Budget limit created successfully', {
                id: response.id,
                monthlyLimit: response.monthlyLimit,
                type: response.type
            });

            return response;
        } catch (error) {
            this.logger.error('Failed to create budget limit', error);
            throw createBudgetError(
                `Failed to create budget limit: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Update an existing budget limit
     */
    async updateBudgetLimit(id: string, updates: Partial<CreateBudgetLimitRequest>): Promise<BudgetLimit> {
        this.logger.debug('Updating budget limit', { id, updates });

        try {
            const response = await this.withRetry(
                () => this.httpClient.put<BudgetLimit>(`/api/spend/budget-limits/${id}`, updates),
                'update budget limit'
            );

            this.logger.info('Budget limit updated successfully', { id });
            return response;
        } catch (error) {
            this.logger.error('Failed to update budget limit', error);
            throw createBudgetError(
                `Failed to update budget limit: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Delete a budget limit
     */
    async deleteBudgetLimit(id: string): Promise<void> {
        this.logger.debug('Deleting budget limit', { id });

        try {
            await this.withRetry(
                () => this.httpClient.delete(`/api/spend/budget-limits/${id}`),
                'delete budget limit'
            );

            this.logger.info('Budget limit deleted successfully', { id });
        } catch (error) {
            this.logger.error('Failed to delete budget limit', error);
            throw createBudgetError(
                `Failed to delete budget limit: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    async getUsageRecords(filters: {
        orgId?: string;
        userId?: string;
        startDate?: string;
        endDate?: string;
        tool?: string;
        model?: string;
        limit?: number;
        offset?: number;
    } = {}): Promise<UsageRecord[]> {
        this.logger.debug('Fetching usage records', filters);

        try {
            const queryParams = buildQueryString(filters);
            const response = await this.withRetry(
                () => this.httpClient.get<{ records: UsageRecord[] }>(`/api/usage${queryParams}`),
                'get usage records'
            );

            this.logger.debug('Usage records retrieved', { count: response.records.length });
            return response.records;
        } catch (error) {
            this.logger.error('Failed to fetch usage records', error);
            throw createBudgetError(
                `Failed to fetch usage records: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get spend analytics for a time period
     */
    async getSpendAnalytics(timeRange: string = '30d'): Promise<{
        totalSpend: number;
        monthlySpend: number;
        dailySpend: number;
        toolSpend: Record<string, number>;
        modelSpend: Record<string, number>;
        userSpend: Record<string, number>;
        budgetLimit: number;
        remainingBudget: number;
        isOverBudget: boolean;
    }> {
        this.logger.debug('Fetching spend analytics', { timeRange });

        try {
            const queryParams = buildQueryString({ timeRange });
            const response = await this.withRetry(
                () => this.httpClient.get<{ spend: any }>(`/api/spend${queryParams}`),
                'get spend analytics'
            );

            this.logger.debug('Spend analytics retrieved', {
                totalSpend: response.spend.totalSpend,
                monthlySpend: response.spend.monthlySpend,
                isOverBudget: response.spend.isOverBudget
            });

            return response.spend;
        } catch (error) {
            this.logger.error('Failed to fetch spend analytics', error);
            throw createBudgetError(
                `Failed to fetch spend analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get tool usage costs
     */
    async getToolCosts(timeRange: string = '30d'): Promise<Record<string, number>> {
        this.logger.debug('Fetching tool costs', { timeRange });

        try {
            const queryParams = buildQueryString({ timeRange });
            const response = await this.withRetry(
                () => this.httpClient.get<{ costs: Record<string, number> }>(`/api/spend/tool-costs${queryParams}`),
                'get tool costs'
            );

            this.logger.debug('Tool costs retrieved', { toolCount: Object.keys(response.costs).length });
            return response.costs;
        } catch (error) {
            this.logger.error('Failed to fetch tool costs', error);
            throw createBudgetError(
                `Failed to fetch tool costs: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    /**
     * Get model usage costs
     */
    async getModelCosts(timeRange: string = '30d'): Promise<Record<string, number>> {
        this.logger.debug('Fetching model costs', { timeRange });

        try {
            const queryParams = buildQueryString({ timeRange });
            const response = await this.withRetry(
                () => this.httpClient.get<{ costs: Record<string, number> }>(`/api/spend/model-costs${queryParams}`),
                'get model costs'
            );

            this.logger.debug('Model costs retrieved', { modelCount: Object.keys(response.costs).length });
            return response.costs;
        } catch (error) {
            this.logger.error('Failed to fetch model costs', error);
            throw createBudgetError(
                `Failed to fetch model costs: ${error instanceof Error ? error.message : "Unknown error"}`,
                undefined,
                undefined
            );
        }
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Check if budget is over limit
     */
    async isOverBudget(userId: string): Promise<boolean> {
        try {
            const context = await this.getBudgetContext(userId);
            return context.current_spend > context.monthly_limit;
        } catch (error) {
            this.logger.error('Failed to check budget status', error);
            return false; // Default to not over budget if check fails
        }
    }

    /**
     * Get budget utilization percentage
     */
    async getBudgetUtilization(userId: string): Promise<number> {
        try {
            const context = await this.getBudgetContext(userId);
            return (context.current_spend / context.monthly_limit) * 100;
        } catch (error) {
            this.logger.error('Failed to get budget utilization', error);
            return 0;
        }
    }

    /**
     * Calculate estimated cost for a model call
     */
    calculateEstimatedCost(
        _model: string,
        inputTokens: number,
        outputTokens: number
    ): number {
        // This would typically use the same cost calculation logic as the platform
        // For now, return a simple estimation
        const baseCost = 0.0001; // Base cost per token
        const inputCost = inputTokens * baseCost;
        const outputCost = outputTokens * baseCost * 2; // Output tokens typically cost more

        return inputCost + outputCost;
    }

    /**
     * Create a usage record from operation details
     */
    createUsageRecord(
        userId: string,
        orgId: string,
        provider: string,
        model: string,
        inputTokens: number,
        outputTokens: number,
        tool?: string,
        correlationId?: string,
        metadata?: Record<string, any>
    ): UsageRecord {
        const cost = this.calculateEstimatedCost(model, inputTokens, outputTokens);

        const record: UsageRecord = {
            userId,
            orgId,
            provider,
            model,
            inputTokens,
            outputTokens,
            cost,
            costType: 'external', // Default cost type
        };

        if (tool) record.tool = tool;
        if (correlationId) record.correlationId = correlationId;
        if (metadata) record.metadata = metadata;

        return record;
    }

    // ============================================================================
    // Batch Operations
    // ============================================================================

    /**
     * Record multiple usage records in batch
     */
    async recordBatchUsage(usageRecords: UsageRecord[]): Promise<void> {
        this.logger.debug('Recording batch usage', { count: usageRecords.length });

        for (const usage of usageRecords) {
            try {
                await this.recordUsage(usage);
            } catch (error) {
                this.logger.error('Failed to record usage in batch', {
                    userId: usage.userId,
                    model: usage.model,
                    error: error instanceof Error ? error.message : "Unknown error"
                });
                // Continue with other records even if one fails
            }
        }

        this.logger.info('Batch usage recording completed', { count: usageRecords.length });
    }

    // ============================================================================
    // Retry Logic
    // ============================================================================

    private async withRetry<T>(
        operation: () => Promise<T>,
        context: string = 'budget operation'
    ): Promise<T> {
        const retryConfig: RetryConfig = {
            maxRetries: this.config.retries || 3,
            retryDelay: this.config.retryDelay || 1000,
            retryCondition: (error) => {
                if (error instanceof BudgetError) {
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
     * Get budget service status
     */
    async getServiceStatus(): Promise<{
        available: boolean;
        responseTime?: number;
        lastError?: string;
    }> {
        const startTime = Date.now();

        try {
            await this.httpClient.get('/api/budget/context');
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
     * Test budget service with a simple request
     */
    async testBudget(userId: string): Promise<boolean> {
        try {
            await this.getBudgetContext(userId);
            return true;
        } catch (error) {
            this.logger.error('Budget test failed', error);
            return false;
        }
    }
}
