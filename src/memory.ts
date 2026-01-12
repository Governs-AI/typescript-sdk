/**
 * ContextClient - Unified Context Memory APIs
 *
 * Supports both internal user IDs and external user IDs for easy integration
 * with external applications.
 */

import {
    GovernsAIConfig,
    SaveContextExplicitInput,
    StoreContextInput,
    SaveContextResponse,
    ConversationSummary,
    PrecheckResponse,
    StoreMemoryParams,
    SearchMemoryParams,
    MemorySearchResult,
    ResolvedUser,
} from './types';
import { HTTPClient, defaultLogger, Logger } from './utils';

export class ContextClient {
    private httpClient: HTTPClient;
    private logger: Logger;

    constructor(httpClient: HTTPClient, _config: GovernsAIConfig) {
        this.httpClient = httpClient;
        this.logger = defaultLogger;
    }

    updateConfig(_config: GovernsAIConfig): void {
        // no-op for now; kept for interface consistency
    }

    async saveContextExplicit(input: SaveContextExplicitInput): Promise<SaveContextResponse> {
        this.logger.debug('Saving context explicitly', { agentId: input.agentId, contentType: input.contentType });
        return this.httpClient.post<SaveContextResponse>('/api/v1/context', input);
    }

    async storeContext(input: StoreContextInput): Promise<SaveContextResponse> {
        this.logger.debug('Storing context (with precheck on server)', { agentId: input.agentId, contentType: input.contentType });
        return this.httpClient.post<SaveContextResponse>('/api/v1/context', input);
    }

    /** LLM-optimized context search (compressed format using summaries only) */
    async searchContextLLM(input: {
        query: string;
        agentId?: string;
        contentTypes?: string[];
        conversationId?: string;
        scope?: 'user' | 'org' | 'both';
        limit?: number;
        threshold?: number; // default 0.5
    }): Promise<{
        success: boolean;
        context: string; // Natural language compressed format (uses summaries)
        memoryCount: number;
        highConfidence: number;
        mediumConfidence: number;
        lowConfidence: number;
        tokenEstimate: number;
    }> {
        this.logger.debug('Searching context for LLM', { queryLen: input.query.length, agentId: input.agentId });
        return this.httpClient.post('/api/v1/context/search/llm', input);
    }

    async searchCrossAgent(query: string, opts?: { limit?: number; threshold?: number; scope?: 'user' | 'org' | 'both'; }): Promise<ReturnType<ContextClient['searchContextLLM']>> {
        this.logger.debug('Cross-agent search (LLM format)', { queryLen: query.length, scope: opts?.scope });
        const input: any = { query };
        if (opts?.limit !== undefined) input.limit = opts.limit;
        if (opts?.threshold !== undefined) input.threshold = opts.threshold;
        if (opts?.scope !== undefined) input.scope = opts.scope;
        return this.searchContextLLM(input);
    }

    async getOrCreateConversation(input: { agentId: string; agentName: string; title?: string; }): Promise<ConversationSummary> {
        this.logger.debug('Get or create conversation', { agentId: input.agentId });
        return this.httpClient.post<ConversationSummary>('/api/v1/context/conversation', input);
    }

    async getConversationContext(input: { conversationId: string; agentId?: string; limit?: number; }): Promise<Array<{
        id: string;
        content: string;
        contentType: string;
        agentId?: string;
        createdAt: string;
        parentId?: string;
        metadata?: Record<string, any>;
    }>> {
        this.logger.debug('Get conversation context', { conversationId: input.conversationId });
        const qs = new URLSearchParams();
        if (input.agentId) qs.set('agentId', input.agentId);
        if (input.limit !== undefined) qs.set('limit', String(input.limit));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        const endpoint = `/api/v1/context/conversation/${input.conversationId}${suffix}`;
        const response = await this.httpClient.get<{ success: boolean; contexts: Array<{
            id: string;
            content: string;
            contentType: string;
            agentId?: string;
            createdAt: string;
            parentId?: string;
            metadata?: Record<string, any>;
        }> }>(endpoint);
        return response.contexts;
    }

    async getRecentContext(params: { userId?: string; limit?: number; scope?: 'user' | 'org' }): Promise<{
        success: boolean;
        context: string;
        memoryCount: number;
        highConfidence: number;
        mediumConfidence: number;
        lowConfidence: number;
        tokenEstimate: number;
    }> {
        const input: any = { 
            query: 'recent context', 
            limit: params.limit ?? 20 
        };
        if (params.scope) input.scope = params.scope;
        return this.searchContextLLM(input);
    }

    async maybeSaveFromPrecheck(params: {
        precheck: PrecheckResponse;
        fallbackContent?: string;
        agentId: string;
        agentName?: string;
        conversationId?: string;
        correlationId?: string;
        metadata?: Record<string, any>;
        scope?: 'user' | 'org';
        visibility?: 'private' | 'team' | 'org';
    }): Promise<{ saved: boolean; contextId?: string }> {
        const { precheck } = params;
        const hasIntent = precheck.intent?.save === true;
        const saveAction = precheck.suggestedActions?.find(a => a.type === 'context.save');
        if (!hasIntent && !saveAction) {
            return { saved: false };
        }

        const content = (saveAction && (saveAction as any).content) || params.fallbackContent || precheck.content?.messages?.map(m => m.content).join('\n');
        if (!content || content.trim() === '') {
            return { saved: false };
        }

        const input: StoreContextInput = {
            content,
            contentType: 'user_message',
            agentId: params.agentId,
        } as StoreContextInput;
        if (params.agentName) (input as any).agentName = params.agentName;
        if (params.conversationId) (input as any).conversationId = params.conversationId;
        if (params.correlationId) (input as any).correlationId = params.correlationId;
        const combinedMeta = { ...(saveAction && (saveAction as any).metadata), ...(params.metadata || {}) };
        if (Object.keys(combinedMeta).length > 0) (input as any).metadata = combinedMeta;
        if (params.scope) (input as any).scope = params.scope;
        if (params.visibility) (input as any).visibility = params.visibility;

        try {
            const saved = await this.storeContext(input);
            return { saved: true, contextId: saved.contextId };
        } catch (error) {
            this.logger.error('maybeSaveFromPrecheck failed', error);
            // Do not throw; best-effort helper.
            return { saved: false };
        }
    }

    // ====================================================================
    // External User Memory Methods
    // For external applications using their own user IDs
    // ====================================================================

    /**
     * Store memory for an external user
     * User will be auto-created if they don't exist
     *
     * @example
     * ```typescript
     * await client.context.storeMemory({
     *   externalUserId: 'shopify-user-123',
     *   externalSource: 'shopify',
     *   content: 'User prefers blue widgets',
     *   agentId: 'product-recommendations',
     *   metadata: { source: 'checkout-page' }
     * });
     * ```
     */
    async storeMemory(params: StoreMemoryParams): Promise<SaveContextResponse> {
        this.logger.debug('Storing memory for external user', {
            externalUserId: params.externalUserId,
            externalSource: params.externalSource || 'default',
        });

        const payload: any = {
            content: params.content,
            contentType: params.contentType || 'user_message',
            agentId: params.agentId || 'external-app',
            agentName: params.agentName,
            externalUserId: params.externalUserId,
            externalSource: params.externalSource || 'default',
            metadata: params.metadata,
            scope: params.scope || 'user',
            visibility: params.visibility || 'private',
        };

        // Include optional user metadata for auto-creation
        if (params.email) payload.email = params.email;
        if (params.name) payload.name = params.name;

        return this.httpClient.post<SaveContextResponse>('/api/v1/context', payload);
    }

    /**
     * Search memories for an external user
     *
     * @example
     * ```typescript
     * const results = await client.context.searchMemory({
     *   externalUserId: 'shopify-user-123',
     *   externalSource: 'shopify',
     *   query: 'product preferences',
     *   limit: 10
     * });
     * ```
     */
    async searchMemory(params: SearchMemoryParams): Promise<MemorySearchResult> {
        this.logger.debug('Searching memory for external user', {
            externalUserId: params.externalUserId,
            query: params.query,
        });

        const payload: any = {
            query: params.query,
            externalUserId: params.externalUserId,
            externalSource: params.externalSource || 'default',
            limit: params.limit || 10,
            threshold: params.threshold || 0.5,
            scope: params.scope || 'user',
        };

        if (params.agentId) payload.agentId = params.agentId;
        if (params.contentTypes) payload.contentTypes = params.contentTypes;

        return this.httpClient.post<MemorySearchResult>('/api/v1/context/search', payload);
    }

    /**
     * Resolve an external user ID to internal user ID
     * This is usually not needed as storeMemory/searchMemory handle this automatically
     *
     * @example
     * ```typescript
     * const resolved = await client.context.resolveUser({
     *   externalUserId: 'shopify-user-123',
     *   externalSource: 'shopify'
     * });
     * console.log('Internal ID:', resolved.internalUserId);
     * ```
     */
    async resolveUser(params: {
        externalUserId: string;
        externalSource?: string;
        email?: string;
        name?: string;
    }): Promise<ResolvedUser> {
        this.logger.debug('Resolving external user', {
            externalUserId: params.externalUserId,
            externalSource: params.externalSource || 'default',
        });

        const payload: any = {
            externalUserId: params.externalUserId,
            externalSource: params.externalSource || 'default',
        };

        if (params.email) payload.email = params.email;
        if (params.name) payload.name = params.name;

        return this.httpClient.post<ResolvedUser>('/api/v1/users/resolve', payload);
    }

    /**
     * Get user info by external ID (without creating)
     *
     * @example
     * ```typescript
     * const user = await client.context.getUserByExternalId({
     *   externalUserId: 'shopify-user-123',
     *   externalSource: 'shopify'
     * });
     * ```
     */
    async getUserByExternalId(params: {
        externalUserId: string;
        externalSource?: string;
    }): Promise<ResolvedUser['user'] | null> {
        this.logger.debug('Looking up external user', {
            externalUserId: params.externalUserId,
            externalSource: params.externalSource || 'default',
        });

        const qs = new URLSearchParams();
        qs.set('externalUserId', params.externalUserId);
        qs.set('externalSource', params.externalSource || 'default');

        try {
            const response = await this.httpClient.get<{ success: boolean; user: ResolvedUser['user'] }>(
                `/api/v1/users/resolve?${qs.toString()}`
            );
            return response.user;
        } catch (error: any) {
            if (error.status === 404) {
                return null;
            }
            throw error;
        }
    }
}


