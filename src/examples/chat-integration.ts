/**
 * Chat Integration Example
 * Shows how to integrate the SDK with a chat application
 */

import { GovernsAIClient, Message } from '../index';

class ChatApplication {
    private client: GovernsAIClient;

    constructor(apiKey: string, baseUrl?: string, orgId: string = 'org-456') {
        this.client = new GovernsAIClient({
            apiKey,
            baseUrl: baseUrl || 'http://localhost:3002',
            orgId,
        });
    }

    async processMessage(messages: Message[], provider: string = 'openai'): Promise<{
        allowed: boolean;
        response?: string;
        confirmationRequired?: boolean;
        confirmationUrl?: string;
    }> {
        try {
            // Precheck the chat message
            const precheckResponse = await this.client.precheck.checkRequest({
                tool: 'model.chat',
                scope: 'net.external',
                raw_text: messages[messages.length - 1]?.content || '',
                payload: { messages, provider },
                tags: ['chat', 'integration'],
            });

            console.log('Precheck decision:', precheckResponse.decision);

            // Handle different decisions
            switch (precheckResponse.decision) {
                case 'allow':
                    // Proceed with AI call
                    const response = await this.callAI(messages, provider);

                    // Record usage
                    await this.recordUsage(provider, 'gpt-4', 100, 50);

                    return { allowed: true, response };

                case 'deny':
                case 'block':
                    return {
                        allowed: false,
                        response: `Request blocked: ${precheckResponse.reasons?.join(', ')}`
                    };

                case 'confirm':
                    // Create confirmation request
                    const confirmation = await this.client.createConfirmation(
                        `chat_${Date.now()}`,
                        'chat',
                        `Chat request with ${messages.length} message(s)`,
                        { messages: messages.slice(-3), provider },
                        precheckResponse.reasons
                    );

                    return {
                        allowed: false,
                        confirmationRequired: true,
                        confirmationUrl: this.client.confirmation.getConfirmationUrl(confirmation.confirmation.correlationId),
                    };

                case 'redact':
                    // Use redacted content
                    const redactedMessages = precheckResponse.content?.messages || messages;
                    const response2 = await this.callAI(redactedMessages, provider);

                    await this.recordUsage(provider, 'gpt-4', 100, 50);

                    return { allowed: true, response: response2 };

                default:
                    return { allowed: false, response: 'Unknown decision' };
            }
        } catch (error) {
            console.error('Error processing message:', error);
            return { allowed: false, response: 'Error processing request' };
        }
    }

    private async callAI(messages: Message[], _provider: string): Promise<string> {
        // This would be your actual AI provider call
        // For demo purposes, return a mock response
        return `AI response for: ${messages[messages.length - 1]?.content}`;
    }

    private async recordUsage(provider: string, model: string, inputTokens: number, outputTokens: number): Promise<void> {
        try {
            await this.client.recordUsage({
                userId: 'user-123',
                orgId: 'org-456',
                provider,
                model,
                inputTokens,
                outputTokens,
                cost: 0.15,
                costType: 'external',
                tool: 'chat',
            });
        } catch (error) {
            console.error('Failed to record usage:', error);
        }
    }

    async getAnalytics(timeRange: string = '30d') {
        try {
            const [decisions, spend, usage] = await Promise.all([
                this.client.analytics.getDecisions({ timeRange, includeStats: true }),
                this.client.analytics.getSpendAnalytics(timeRange),
                this.client.analytics.getUsageStats(timeRange),
            ]);

            return {
                decisions: decisions.stats,
                spend: spend.spend,
                usage,
            };
        } catch (error) {
            console.error('Failed to get analytics:', error);
            return null;
        }
    }
}

// Example usage
async function chatIntegrationExample() {
    const chatApp = new ChatApplication('your-api-key');

    // Process a chat message
    const messages: Message[] = [
        {
            id: '1',
            role: 'user',
            content: 'Hello, can you help me with my project?',
        },
    ];

    const result = await chatApp.processMessage(messages);

    if (result.allowed) {
        console.log('AI Response:', result.response);
    } else if (result.confirmationRequired) {
        console.log('Confirmation required:', result.confirmationUrl);
    } else {
        console.log('Request blocked:', result.response);
    }

    // Get analytics
    const analytics = await chatApp.getAnalytics();
    if (analytics) {
        console.log('Analytics:', analytics);
    }
}

// Run the example
if (require.main === module) {
    chatIntegrationExample();
}
