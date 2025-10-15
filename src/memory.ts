/**
 * ContextClient - Unified Context Memory APIs
 */

import {
    GovernsAIConfig,
    SaveContextExplicitInput,
    StoreContextInput,
    SaveContextResponse,
    ContextSearchInput,
    ContextSearchResultItem,
    ConversationSummary,
    ConversationItem,
    PrecheckResponse,
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

    async searchContext(input: ContextSearchInput): Promise<ContextSearchResultItem[]> {
        this.logger.debug('Searching context', { queryLen: input.query?.length, scope: input.scope });
        const response = await this.httpClient.post<{ results: ContextSearchResultItem[] }>('/api/v1/context/search', input);
        return response.results;
    }

    async searchCrossAgent(query: string, opts?: { limit?: number; threshold?: number; scope?: 'user' | 'org' | 'both'; }): Promise<ContextSearchResultItem[]> {
        this.logger.debug('Cross-agent search', { queryLen: query.length, scope: opts?.scope });
        const input: ContextSearchInput = { query } as ContextSearchInput;
        if (typeof opts?.limit === 'number') (input as any).limit = opts.limit;
        if (typeof opts?.threshold === 'number') (input as any).threshold = opts.threshold as number;
        if (opts?.scope) (input as any).scope = opts.scope;
        return this.searchContext(input);
    }

    async getOrCreateConversation(input: { agentId: string; agentName: string; title?: string; }): Promise<ConversationSummary> {
        this.logger.debug('Get or create conversation', { agentId: input.agentId });
        return this.httpClient.post<ConversationSummary>('/api/v1/context/conversation', input);
    }

    async getConversationContext(input: { conversationId: string; agentId?: string; limit?: number; }): Promise<ConversationItem[]> {
        this.logger.debug('Get conversation context', { conversationId: input.conversationId });
        const qs = new URLSearchParams();
        if (input.agentId) qs.set('agentId', input.agentId);
        if (input.limit !== undefined) qs.set('limit', String(input.limit));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        const endpoint = `/api/v1/context/conversation/${input.conversationId}${suffix}`;
        const response = await this.httpClient.get<{ items: ConversationItem[] }>(endpoint);
        return response.items;
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
}


