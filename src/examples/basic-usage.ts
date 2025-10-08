/**
 * Basic Usage Example
 * Demonstrates the core functionality of the GovernsAI SDK
 */

import { createClientFromEnv } from '../index';

async function basicUsageExample() {
    // Create client from environment variables
    const client = createClientFromEnv();

    try {
        // Test connection
        const isConnected = await client.testConnection();
        console.log('Connection status:', isConnected);

        // Get budget context for a specific user
        const userId = 'user-123';
        const budgetContext = await client.getBudgetContext(userId);
        console.log('Budget context:', budgetContext);

        // Precheck a chat message
        const precheckResponse = await client.precheck.checkRequest({
            tool: 'model.chat',
            scope: 'net.external',
            raw_text: 'Hello, how are you?',
            payload: { messages: [{ role: 'user', content: 'Hello' }] },
            tags: ['demo', 'chat'],
        });

        console.log('Precheck response:', precheckResponse);

        if (precheckResponse.decision === 'deny') {
            console.log('Request blocked:', precheckResponse.reasons);
            return;
        }

        if (precheckResponse.decision === 'confirm') {
            console.log('Confirmation required');
            // Handle confirmation flow...
        }

        // Record usage after AI call
        await client.recordUsage({
            userId: 'user-123',
            orgId: 'org-456',
            provider: 'openai',
            model: 'gpt-4',
            inputTokens: 100,
            outputTokens: 50,
            cost: 0.15,
            costType: 'external',
        });

        console.log('Usage recorded successfully');

    } catch (error) {
        console.error('Error:', error);
    }
}

// Run the example
if (require.main === module) {
    basicUsageExample();
}
