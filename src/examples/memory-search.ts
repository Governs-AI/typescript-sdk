/**
 * Memory and Search Example
 * Demonstrates the new ContextClient memory and search functionality
 */

import { GovernsAIClient } from '../index';

class MemorySearchExample {
    private client: GovernsAIClient;

    constructor(apiKey: string, baseUrl: string, orgId: string = 'org-456') {
        this.client = new GovernsAIClient({
            apiKey,
            baseUrl,
            orgId,
        });
    }

    async demonstrateMemoryOperations() {
        console.log('=== Memory and Search Operations Demo ===\n');

        // 1. Save context explicitly (user-initiated)
        console.log('1. Saving context explicitly...');
        try {
            const saveResult = await this.client.context.saveContextExplicit({
                content: 'User prefers to be called by their first name, John. They are working on a React project with TypeScript.',
                contentType: 'user_message',
                agentId: 'chat-agent',
                agentName: 'Chat Assistant',
                conversationId: 'conv-123',
                correlationId: 'explicit-save-001',
                metadata: { 
                    userPreference: 'first_name',
                    project: 'React TypeScript',
                    timestamp: new Date().toISOString()
                },
                scope: 'user',
                visibility: 'private',
            });
            console.log('Context saved with ID:', saveResult.contextId);
        } catch (error) {
            console.error('Failed to save context:', error);
        }

        // 2. Store context (with server-side precheck)
        console.log('\n2. Storing context with precheck...');
        try {
            const storeResult = await this.client.context.storeContext({
                content: 'The user mentioned they are having issues with TypeScript compilation errors in their React components.',
                contentType: 'user_message',
                agentId: 'chat-agent',
                agentName: 'Chat Assistant',
                conversationId: 'conv-123',
                correlationId: 'store-001',
                metadata: { 
                    issueType: 'TypeScript compilation',
                    framework: 'React',
                    severity: 'medium'
                },
                scope: 'user',
                visibility: 'private',
            });
            console.log('Context stored with ID:', storeResult.contextId);
        } catch (error) {
            console.error('Failed to store context:', error);
        }

        // 3. Search context using LLM-optimized search
        console.log('\n3. Searching context (LLM format)...');
        try {
            const searchResult = await this.client.context.searchContextLLM({
                query: 'TypeScript React compilation issues',
                agentId: 'chat-agent',
                scope: 'user',
                limit: 3,
                threshold: 0.6,
            });

            console.log('Search Results:');
            console.log('- Context:', searchResult.context);
            console.log('- Memory Count:', searchResult.memoryCount);
            console.log('- Confidence Levels:', {
                high: searchResult.highConfidence,
                medium: searchResult.mediumConfidence,
                low: searchResult.lowConfidence,
            });
            console.log('- Token Estimate:', searchResult.tokenEstimate);
        } catch (error) {
            console.error('Failed to search context:', error);
        }

        // 4. Cross-agent search
        console.log('\n4. Cross-agent search...');
        try {
            const crossAgentResult = await this.client.context.searchCrossAgent(
                'user preferences and project details',
                { limit: 2, threshold: 0.5, scope: 'user' }
            );

            console.log('Cross-agent search results:');
            console.log('- Context:', crossAgentResult.context);
            console.log('- Memory Count:', crossAgentResult.memoryCount);
        } catch (error) {
            console.error('Failed cross-agent search:', error);
        }

        // 5. Create or get conversation
        console.log('\n5. Managing conversation...');
        try {
            const conversation = await this.client.context.getOrCreateConversation({
                agentId: 'chat-agent',
                agentName: 'Chat Assistant',
                title: 'TypeScript Help Session',
            });

            console.log('Conversation:', {
                id: conversation.id,
                title: conversation.title,
                messageCount: conversation.messageCount,
                tokenCount: conversation.tokenCount,
                scope: conversation.scope,
            });
        } catch (error) {
            console.error('Failed to manage conversation:', error);
        }

        // 6. Get conversation context
        console.log('\n6. Getting conversation history...');
        try {
            const conversationId = 'conv-123';
            const messages = await this.client.context.getConversationContext({
                conversationId,
                agentId: 'chat-agent',
                limit: 10,
            });

            console.log(`Found ${messages.length} messages in conversation ${conversationId}:`);
            messages.forEach((msg, index) => {
                console.log(`  ${index + 1}. [${msg.contentType}] ${msg.content.substring(0, 50)}...`);
            });
        } catch (error) {
            console.error('Failed to get conversation context:', error);
        }

        // 7. Demonstrate precheck with context saving
        console.log('\n7. Precheck with automatic context saving...');
        try {
            // Simulate a precheck response that suggests saving context
            const mockPrecheckResponse = {
                decision: 'allow' as const,
                intent: { save: true },
                suggestedActions: [{
                    type: 'context.save',
                    content: 'User is working on a complex React TypeScript project with multiple components',
                    reason: 'High-value technical context',
                    metadata: { projectType: 'React', language: 'TypeScript', complexity: 'high' }
                }],
                reasons: ['Technical context worth preserving'],
            };

            const contextResult = await this.client.context.maybeSaveFromPrecheck({
                precheck: mockPrecheckResponse,
                fallbackContent: 'User mentioned working on React TypeScript project',
                agentId: 'chat-agent',
                agentName: 'Chat Assistant',
                conversationId: 'conv-123',
                correlationId: 'precheck-save-001',
                metadata: { source: 'precheck_suggestion' },
                scope: 'user',
                visibility: 'private',
            });

            console.log('Precheck-based context save:', {
                saved: contextResult.saved,
                contextId: contextResult.contextId,
            });
        } catch (error) {
            console.error('Failed precheck-based context save:', error);
        }
    }

    async demonstrateAdvancedSearch() {
        console.log('\n=== Advanced Search Scenarios ===\n');

        // Search with different content types
        console.log('1. Searching for specific content types...');
        try {
            const contentSearch = await this.client.context.searchContextLLM({
                query: 'user preferences and settings',
                agentId: 'chat-agent',
                contentTypes: ['user_message', 'decision'],
                scope: 'user',
                limit: 5,
                threshold: 0.7,
            });

            console.log('Content-type filtered search:', contentSearch.context);
        } catch (error) {
            console.error('Content-type search failed:', error);
        }

        // Search with conversation scope
        console.log('\n2. Searching within specific conversation...');
        try {
            const conversationSearch = await this.client.context.searchContextLLM({
                query: 'TypeScript errors and solutions',
                agentId: 'chat-agent',
                conversationId: 'conv-123',
                scope: 'user',
                limit: 3,
                threshold: 0.8,
            });

            console.log('Conversation-scoped search:', conversationSearch.context);
        } catch (error) {
            console.error('Conversation search failed:', error);
        }

        // Organization-wide search
        console.log('\n3. Organization-wide search...');
        try {
            const orgSearch = await this.client.context.searchContextLLM({
                query: 'best practices and guidelines',
                agentId: 'chat-agent',
                scope: 'org',
                limit: 10,
                threshold: 0.5,
            });

            console.log('Organization search:', {
                context: orgSearch.context,
                memoryCount: orgSearch.memoryCount,
                tokenEstimate: orgSearch.tokenEstimate,
            });
        } catch (error) {
            console.error('Organization search failed:', error);
        }
    }
}

// Example usage
async function memorySearchExample() {
    const memoryExample = new MemorySearchExample(
        'your-api-key',
        'http://localhost:3002',
        'org-456'
    );

    // Run basic memory operations
    await memoryExample.demonstrateMemoryOperations();

    // Run advanced search scenarios
    await memoryExample.demonstrateAdvancedSearch();

    console.log('\n=== Memory and Search Demo Complete ===');
}

// Run the example
// If running in a Node context, uncomment the following to run directly:
// (globalThis as any).require && (globalThis as any).module &&
//     ((globalThis as any).require.main === (globalThis as any).module) && memorySearchExample();

export { MemorySearchExample, memorySearchExample };
