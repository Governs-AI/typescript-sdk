/**
 * Improved Usage Example
 * Shows the better design with dynamic userId and static orgId
 */

import { GovernsAIClient, createClientFromEnv } from '../index';

async function improvedUsageExample() {
    // Create client with organization context (static)
    const client = new GovernsAIClient({
        apiKey: process.env['GOVERNS_API_KEY']!,
        baseUrl: process.env['GOVERNS_BASE_URL']!,
        orgId: 'org-456', // Organization context - static
    });

    // Different users can use the same client instance
    const user1 = 'user-123';
    const user2 = 'user-456';

    try {
        // Test connection
        const isConnected = await client.testConnection();
        console.log('Connection status:', isConnected);

        // Get budget context for specific users
        const budget1 = await client.getBudgetContext(user1);
        const budget2 = await client.getBudgetContext(user2);
        console.log('User 1 budget:', budget1);
        console.log('User 2 budget:', budget2);

        // Precheck requests for different users
        const precheck1 = await client.precheck({
            tool: 'model.chat',
            scope: 'net.external',
            raw_text: 'Hello from user 1',
            payload: { messages: [{ role: 'user', content: 'Hello' }] },
            tags: ['demo', 'chat'],
        }, user1);

        const precheck2 = await client.precheck({
            tool: 'model.chat',
            scope: 'net.external',
            raw_text: 'Hello from user 2',
            payload: { messages: [{ role: 'user', content: 'Hello' }] },
            tags: ['demo', 'chat'],
        }, user2);

        console.log('User 1 precheck:', precheck1.decision);
        console.log('User 2 precheck:', precheck2.decision);

        // Record usage for specific users
        await client.recordUsage({
            userId: user1,
            orgId: 'org-456',
            provider: 'openai',
            model: 'gpt-4',
            inputTokens: 100,
            outputTokens: 50,
            cost: 0.15,
            costType: 'external',
        });

        await client.recordUsage({
            userId: user2,
            orgId: 'org-456',
            provider: 'openai',
            model: 'gpt-4',
            inputTokens: 80,
            outputTokens: 40,
            cost: 0.12,
            costType: 'external',
        });

        console.log('Usage recorded for both users');

    } catch (error) {
        console.error('Error:', error);
    }
}

// Alternative: Create client from environment variables
async function envBasedExample() {
    // This will read from environment variables
    const client = createClientFromEnv();

    // Use with dynamic userId
    const userId = 'user-789';

    const budget = await client.getBudgetContext(userId);
    console.log('Budget for user:', budget);
}

// Export for potential use
export { envBasedExample };

// Run the example
if (require.main === module) {
    improvedUsageExample();
}
