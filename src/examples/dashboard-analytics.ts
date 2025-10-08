/**
 * Dashboard Analytics Example
 * Shows how to use the SDK for analytics and reporting
 */

import { GovernsAIClient } from '../index';

class DashboardApplication {
    private client: GovernsAIClient;

    constructor(apiKey: string, baseUrl?: string, orgId: string = 'org-456') {
        this.client = new GovernsAIClient({
            apiKey,
            baseUrl: baseUrl || 'http://localhost:3002',
            orgId,
        });
    }

    async getDashboardData(orgSlug: string, timeRange: string = '30d') {
        try {
            console.log('Fetching dashboard data...');

            const dashboardData = await this.client.analytics.getDashboardData(orgSlug, timeRange);

            console.log('Dashboard data retrieved successfully');
            return dashboardData;
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
            return null;
        }
    }

    async getDecisionAnalytics(timeRange: string = '30d') {
        try {
            console.log('Fetching decision analytics...');

            const [decisions, decisionStats] = await Promise.all([
                this.client.analytics.getDecisions({ timeRange, includeStats: true }),
                this.client.analytics.getDecisionStats(timeRange),
            ]);

            return {
                decisions: decisions.decisions,
                stats: decisionStats,
            };
        } catch (error) {
            console.error('Failed to fetch decision analytics:', error);
            return null;
        }
    }

    async getSpendAnalytics(timeRange: string = '30d') {
        try {
            console.log('Fetching spend analytics...');

            const [spend, toolCosts, modelCosts, userSpend] = await Promise.all([
                this.client.analytics.getSpendAnalytics(timeRange),
                this.client.analytics.getSpendByTool(timeRange),
                this.client.analytics.getSpendByModel(timeRange),
                this.client.analytics.getSpendByUser(timeRange),
            ]);

            return {
                spend: spend.spend,
                toolCosts,
                modelCosts,
                userSpend,
            };
        } catch (error) {
            console.error('Failed to fetch spend analytics:', error);
            return null;
        }
    }

    async getUsageAnalytics(timeRange: string = '30d') {
        try {
            console.log('Fetching usage analytics...');

            const [usageStats, usageRecords] = await Promise.all([
                this.client.analytics.getUsageStats(timeRange),
                this.client.analytics.getUsageRecords({
                    startDate: this.getStartDate(timeRange),
                    limit: 100
                }),
            ]);

            return {
                stats: usageStats,
                records: usageRecords,
            };
        } catch (error) {
            console.error('Failed to fetch usage analytics:', error);
            return null;
        }
    }

    async getToolAnalytics(timeRange: string = '30d') {
        try {
            console.log('Fetching tool analytics...');

            const [toolCalls, toolUsageStats] = await Promise.all([
                this.client.analytics.getToolCalls({ timeRange, includeStats: true }),
                this.client.analytics.getToolUsageStats(timeRange),
            ]);

            return {
                toolCalls: toolCalls.toolCalls,
                stats: toolUsageStats,
            };
        } catch (error) {
            console.error('Failed to fetch tool analytics:', error);
            return null;
        }
    }

    async generateReport(orgSlug: string, timeRange: string = '30d') {
        try {
            console.log('Generating comprehensive report...');

            const [
                dashboardData,
                decisionAnalytics,
                spendAnalytics,
                usageAnalytics,
                toolAnalytics,
            ] = await Promise.all([
                this.getDashboardData(orgSlug, timeRange),
                this.getDecisionAnalytics(timeRange),
                this.getSpendAnalytics(timeRange),
                this.getUsageAnalytics(timeRange),
                this.getToolAnalytics(timeRange),
            ]);

            const report = {
                timeRange,
                generatedAt: new Date().toISOString(),
                summary: {
                    totalDecisions: decisionAnalytics?.stats.total || 0,
                    totalSpend: spendAnalytics?.spend.totalSpend || 0,
                    totalUsage: usageAnalytics?.stats.totalRecords || 0,
                    totalToolCalls: toolAnalytics?.stats.total || 0,
                },
                decisions: decisionAnalytics,
                spend: spendAnalytics,
                usage: usageAnalytics,
                tools: toolAnalytics,
                dashboard: dashboardData,
            };

            console.log('Report generated successfully');
            return report;
        } catch (error) {
            console.error('Failed to generate report:', error);
            return null;
        }
    }

    async exportAnalyticsData(timeRange: string = '30d', format: 'csv' | 'json' = 'json') {
        try {
            console.log(`Exporting analytics data in ${format} format...`);

            const usageRecords = await this.client.analytics.getUsageRecords({
                startDate: this.getStartDate(timeRange),
                limit: 1000
            });

            if (format === 'csv') {
                const csvData = this.client.analytics.exportToCSV(usageRecords, 'usage_records.csv');
                return csvData;
            } else {
                return JSON.stringify(usageRecords, null, 2);
            }
        } catch (error) {
            console.error('Failed to export analytics data:', error);
            return null;
        }
    }

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
}

// Example usage
async function dashboardAnalyticsExample() {
    const dashboardApp = new DashboardApplication('your-api-key');

    // Get comprehensive dashboard data
    const dashboardData = await dashboardApp.getDashboardData('your-org-slug', '30d');
    if (dashboardData) {
        console.log('Dashboard Data:', {
            decisions: dashboardData.decisions.stats.total,
            toolCalls: dashboardData.toolCalls.stats.total,
            spend: dashboardData.spend.spend.totalSpend,
            usage: dashboardData.usage.totalRecords,
        });
    }

    // Get decision analytics
    const decisionAnalytics = await dashboardApp.getDecisionAnalytics('7d');
    if (decisionAnalytics) {
        console.log('Decision Analytics:', decisionAnalytics.stats);
    }

    // Get spend analytics
    const spendAnalytics = await dashboardApp.getSpendAnalytics('30d');
    if (spendAnalytics) {
        console.log('Spend Analytics:', {
            totalSpend: spendAnalytics.spend.totalSpend,
            monthlySpend: spendAnalytics.spend.monthlySpend,
            isOverBudget: spendAnalytics.spend.isOverBudget,
        });
    }

    // Generate comprehensive report
    const report = await dashboardApp.generateReport('your-org-slug', '30d');
    if (report) {
        console.log('Report Summary:', report.summary);
    }

    // Export data
    const csvData = await dashboardApp.exportAnalyticsData('30d', 'csv');
    if (csvData) {
        console.log('CSV Export completed');
    }
}

// Run the example
if (require.main === module) {
    dashboardAnalyticsExample();
}
