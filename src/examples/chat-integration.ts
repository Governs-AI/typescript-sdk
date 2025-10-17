/**
 * Chat Integration Example
 * Shows how to integrate the SDK with a chat application
 */

import { GovernsAIClient, Message } from '../index';

class ChatApplication {
    private client: GovernsAIClient;

    constructor(apiKey: string, baseUrl: string, orgId: string = 'org-456') {
        this.client = new GovernsAIClient({
            apiKey,
            baseUrl,
            orgId,
        });
    }

    async processMessage(messages: Message[], provider: string = 'openai', agentId: string = 'chat-agent'): Promise<{
        allowed: boolean;
        response?: string;
        confirmationRequired?: boolean;
        confirmationUrl?: string;
        contextSaved?: boolean;
    }> {
        try {
            // Precheck the chat message
            const precheckResponse = await this.client.precheck({
                tool: 'model.chat',
                scope: 'net.external',
                raw_text: messages[messages.length - 1]?.content || '',
                payload: { messages, provider },
                tags: ['chat', 'integration'],
            }, 'user-123');

            console.log('Precheck decision:', precheckResponse.decision);

            // Handle different decisions
            switch (precheckResponse.decision) {
                case 'allow':
                    // Proceed with AI call
                    const response = await this.callAI(messages, provider);

                    // Record usage
                    await this.recordUsage(provider, 'gpt-4', 100, 50);

                    // Check if precheck suggests saving context
                    const contextResult = await this.client.context.maybeSaveFromPrecheck({
                        precheck: precheckResponse,
                        fallbackContent: messages[messages.length - 1]?.content,
                        agentId,
                        agentName: 'Chat Assistant',
                        conversationId: 'conv-123',
                        correlationId: `chat_${Date.now()}`,
                        metadata: { provider, messageCount: messages.length },
                    });

                    return { allowed: true, response, contextSaved: contextResult.saved };

                case 'deny':
                case 'block':
                    return {
                        allowed: false,
                        response: `Request blocked: ${precheckResponse.reasons?.join(', ')}`
                    };

                case 'confirm':
                    // Create confirmation request
                    const confirmation = await this.client.confirm(
                        `chat_${Date.now()}`,
                        'chat',
                        `Chat request with ${messages.length} message(s)`,
                        { messages: messages.slice(-3), provider },
                        precheckResponse.reasons
                    );

                    return {
                        allowed: false,
                        confirmationRequired: true,
                        confirmationUrl: this.client.confirmationClient.getConfirmationUrl(confirmation.confirmation.correlationId),
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

    async searchMemory(query: string, agentId: string = 'chat-agent') {
        try {
            // Search for relevant context using LLM-optimized search
            const searchResult = await this.client.context.searchContextLLM({
                query,
                agentId,
                scope: 'user',
                limit: 5,
                threshold: 0.7,
            });

            console.log('Memory search results:', {
                context: searchResult.context,
                memoryCount: searchResult.memoryCount,
                confidence: {
                    high: searchResult.highConfidence,
                    medium: searchResult.mediumConfidence,
                    low: searchResult.lowConfidence,
                },
                tokenEstimate: searchResult.tokenEstimate,
            });

            return searchResult;
        } catch (error) {
            console.error('Failed to search memory:', error);
            return null;
        }
    }

    async getConversationHistory(conversationId: string, agentId: string = 'chat-agent') {
        try {
            // Get conversation context
            const conversation = await this.client.context.getOrCreateConversation({
                agentId,
                agentName: 'Chat Assistant',
                title: 'User Conversation',
            });

            const messages = await this.client.context.getConversationContext({
                conversationId: conversation.id,
                agentId,
                limit: 20,
            });

            return {
                conversation,
                messages,
            };
        } catch (error) {
            console.error('Failed to get conversation history:', error);
            return null;
        }
    }

    async getAnalytics(timeRange: string = '30d') {
        try {
            const [decisions, spend, usage] = await Promise.all([
                this.client.analyticsClient.getDecisions({ timeRange, includeStats: true }),
                this.client.analyticsClient.getSpendAnalytics(timeRange),
                this.client.analyticsClient.getUsageStats(timeRange),
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
    const chatApp = new ChatApplication('your-api-key', 'http://example.com');

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
        if (result.contextSaved) {
            console.log('Context was automatically saved based on precheck suggestions');
        }
    } else if (result.confirmationRequired) {
        console.log('Confirmation required:', result.confirmationUrl);
    } else {
        console.log('Request blocked:', result.response);
    }

    // Search memory for relevant context
    const memorySearch = await chatApp.searchMemory('project help', 'chat-agent');
    if (memorySearch) {
        console.log('Found relevant context:', memorySearch.context);
    }

    // Get conversation history
    const history = await chatApp.getConversationHistory('conv-123', 'chat-agent');
    if (history) {
        console.log('Conversation history:', history.messages.length, 'messages');
    }

    // Get analytics
    const analytics = await chatApp.getAnalytics();
    if (analytics) {
        console.log('Analytics:', analytics);
    }
}

// Run the example
// If running in a Node context, uncomment the following to run directly:
// (globalThis as any).require && (globalThis as any).module &&
//     ((globalThis as any).require.main === (globalThis as any).module) && chatIntegrationExample();
