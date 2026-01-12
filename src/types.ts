/**
 * Core TypeScript definitions for GovernsAI SDK
 * Based on the current API patterns from the platform
 */

// GovernsAIError is imported from errors.ts when needed

// ============================================================================
// Core Configuration Types
// ============================================================================

export interface GovernsAIConfig {
    apiKey: string;
    baseUrl: string; // required, no static default
    precheckBaseUrl?: string; // optional - if missing, precheck uses baseUrl
    orgId: string; // Required - organization context
    timeout?: number; // Default: 30000
    retries?: number; // Default: 3
    retryDelay?: number; // Default: 1000
}

// ============================================================================
// Precheck Types
// ============================================================================

export type Decision = "allow" | "deny" | "block" | "confirm" | "redact";

export interface PolicyDefaults {
    ingress: { action: string };
    egress: { action: string };
}

export interface ToolAccessRule {
    direction: "ingress" | "egress";
    action: Decision;
    allow_pii?: Record<string, string>; // PII type -> action mapping
}

export interface PolicyConfig {
    version: string;
    model?: string;
    defaults: PolicyDefaults;
    tool_access: Record<string, ToolAccessRule>;
    deny_tools: string[];
    allow_tools?: string[];
    network_scopes: string[];
    network_tools: string[];
    on_error: "block" | "allow" | "redact";
}

export interface ToolConfigMetadata {
    tool_name: string;
    scope: string;
    direction: "ingress" | "egress" | "both";
    metadata: {
        category: string;
        risk_level: "low" | "medium" | "high" | "critical";
        requires_approval?: boolean;
        [key: string]: any;
    };
}

export interface PrecheckRequest {
    tool: string;
    scope: string;
    raw_text?: string;
    payload?: any;
    tags?: string[];
    corr_id?: string;
    user_id?: string;
    policy_config?: PolicyConfig;
    tool_config?: ToolConfigMetadata;
    budget_context?: any;
}

export interface PrecheckResponse {
    decision: Decision;
    content?: {
        messages?: Message[];
        args?: any;
        [key: string]: any;
    };
    reasons?: string[];
    pii_findings?: any[];
    metadata?: Record<string, any>;
    policy_id?: string;
    ts?: number;
    budget_status?: BudgetStatus;
    budget_info?: BudgetInfo;
    // Spec additions
    intent?: { save?: boolean };
    suggestedActions?: SuggestedAction[];
}

// Suggested actions from precheck (per spec)
export type SuggestedAction =
    | { type: 'context.save'; content?: string; reason?: string; metadata?: Record<string, any> }
    | { type: string; [k: string]: any };

// ============================================================================
// Message and Chat Types
// ============================================================================

export interface Message {
    id: string;
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    decision?: Decision;
    reasons?: string[];
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    confirmationRequired?: boolean;
    confirmationUrl?: string;
    correlationId?: string;
}

export interface ToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}

export interface Tool {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, any>;
            required?: string[];
        };
    };
}

// ============================================================================
// Budget and Usage Types
// ============================================================================

export interface BudgetContext {
    monthly_limit: number;
    current_spend: number;
    llm_spend: number;
    purchase_spend: number;
    remaining_budget: number;
    budget_type: "user" | "organization";
}

export interface BudgetStatus {
    allowed: boolean;
    currentSpend: number;
    limit: number;
    remaining: number;
    percentUsed: number;
    reason?: string;
}

export interface BudgetInfo {
    monthlyLimit: number;
    currentSpend: number;
    remainingBudget: number;
    isOverBudget: boolean;
}

export interface UsageRecord {
    userId: string;
    orgId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    costType: string;
    tool?: string;
    correlationId?: string;
    metadata?: Record<string, any>;
    apiKeyId?: string;
}

export interface PurchaseRecord {
    userId: string;
    orgId: string;
    amount: number;
    currency: string;
    description: string;
    metadata?: Record<string, any>;
}

export interface BudgetLimit {
    id: string;
    orgId: string;
    userId?: string;
    monthlyLimit: number;
    type: "user" | "organization";
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CreateBudgetLimitRequest {
    orgId: string;
    userId?: string;
    monthlyLimit: number;
    type: "user" | "organization";
}

// ============================================================================
// Confirmation Types
// ============================================================================

export interface ConfirmationRequest {
    correlationId: string;
    requestType: "tool_call" | "chat" | "mcp";
    requestDesc: string;
    requestPayload: any;
    decision?: string;
    reasons?: string[];
}

export interface ConfirmationResponse {
    success: boolean;
    confirmation: {
        id: string;
        correlationId: string;
        requestType: string;
        requestDesc: string;
        decision: string;
        reasons: string[];
        status: string;
        expiresAt: string;
        createdAt: string;
    };
}

export interface ConfirmationStatus {
    confirmation: {
        id: string;
        correlationId: string;
        userId: string;
        orgId: string;
        requestType: string;
        requestDesc: string;
        requestPayload: any;
        decision: string;
        reasons: string[];
        status: "pending" | "approved" | "denied" | "expired";
        expiresAt: string;
        createdAt: string;
        approvedAt?: string;
        user: {
            id: string;
            email: string;
            name: string;
        };
        org: {
            id: string;
            name: string;
            slug: string;
        };
    };
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface DecisionData {
    decisions: Decision[];
    stats: {
        total: number;
        byDecision: Record<string, number>;
        byDirection: Record<string, number>;
        byTool: Record<string, number>;
    };
    pagination: {
        limit: number;
        offset: number;
        hasMore: boolean;
    };
}

export interface SpendData {
    spend: {
        totalSpend: number;
        monthlySpend: number;
        dailySpend: number;
        toolSpend: Record<string, number>;
        modelSpend: Record<string, number>;
        userSpend: Record<string, number>;
        budgetLimit: number;
        remainingBudget: number;
        isOverBudget: boolean;
    };
}

export interface ToolCallData {
    toolCalls: ToolCall[];
    stats: {
        total: number;
        byTool: Record<string, number>;
        byStatus: Record<string, number>;
    };
    pagination: {
        limit: number;
        offset: number;
        hasMore: boolean;
    };
}

// =========================================================================
// Context Memory Types (per ContextClient spec)
// =========================================================================

export interface ContextSaveInputBase {
    content: string;
    contentType: 'user_message' | 'agent_message' | 'document' | 'decision' | 'tool_result';
    agentId: string;
    agentName?: string;
    conversationId?: string;
    parentId?: string;
    correlationId?: string;
    metadata?: Record<string, any>;
    scope?: 'user' | 'org';
    visibility?: 'private' | 'team' | 'org';
    expiresAt?: string; // ISO
}

export type SaveContextExplicitInput = ContextSaveInputBase;
export type StoreContextInput = ContextSaveInputBase;

export interface SaveContextResponse {
    contextId: string;
}

export interface ContextSearchInput {
    query: string;
    userId?: string;
    agentId?: string;
    contentTypes?: string[];
    conversationId?: string;
    scope?: 'user' | 'org' | 'both';
    limit?: number;
    threshold?: number; // default 0.7
    startDate?: string; // ISO
    endDate?: string;   // ISO
}

export interface ContextSearchResultItem {
    id: string;
    userId?: string;
    orgId?: string;
    content: string;
    contentType: string;
    agentId?: string;
    agentName?: string;
    conversationId?: string;
    metadata?: Record<string, any>;
    createdAt: string;
    similarity: number;
}

export interface ConversationSummary {
    id: string;
    title?: string;
    messageCount: number;
    tokenCount: number;
    lastMessageAt?: string;
    scope: 'user' | 'org';
}

export interface ConversationItem {
    id: string;
    content: string;
    contentType: string;
    agentId?: string;
    createdAt: string;
    parentId?: string;
    metadata?: Record<string, any>;
}

export interface DecisionFilters {
    orgId?: string;
    userId?: string;
    timeRange?: string;
    decision?: Decision;
    tool?: string;
    includeStats?: boolean;
    limit?: number;
    offset?: number;
}

export interface ToolCallFilters {
    orgId?: string;
    userId?: string;
    timeRange?: string;
    tool?: string;
    status?: string;
    includeStats?: boolean;
    limit?: number;
    offset?: number;
}

export interface UsageFilters {
    orgId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    tool?: string;
    model?: string;
    limit?: number;
    offset?: number;
}

// ============================================================================
// Tool Management Types
// ============================================================================

export interface ToolMetadata {
    tool_name: string;
    scope: string;
    direction: "ingress" | "egress" | "both";
    metadata: {
        category: string;
        risk_level: "low" | "medium" | "high" | "critical";
        requires_approval?: boolean;
    };
}

export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
    decision?: Decision;
    reasons?: string[];
}

export interface ToolFilters {
    category?: string;
    risk_level?: string;
    requires_approval?: boolean;
    limit?: number;
    offset?: number;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface APIKey {
    id: string;
    key: string;
    name: string;
    isActive: boolean;
    createdAt: string;
    lastUsedAt?: string;
}

export interface CreateAPIKeyRequest {
    name: string;
    expiresAt?: string;
}

export interface UserProfile {
    id: string;
    email: string;
    name: string;
    organizations: Array<{
        id: string;
        name: string;
        slug: string;
        role: string;
    }>;
}

// ============================================================================
// Retry and Error Types
// ============================================================================

// RetryConfig is defined in errors.ts

export interface HTTPResponse {
    status: number;
    statusText: string;
    data: any;
    headers: Record<string, string>;
}

// ============================================================================
// Stream Types
// ============================================================================

export interface StreamEvent {
    type: "decision" | "content" | "error" | "done" | "tool_call" | "tool_result";
    data: any;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Provider = "openai" | "ollama" | "anthropic" | "google";

export interface ChatRequest {
    messages: Message[];
    model?: string;
    provider?: Provider;
}

export interface MCPRequest {
    tool: string;
    args: Record<string, any>;
}

export interface MCPResponse {
    success: boolean;
    data?: any;
    error?: string;
    decision?: Decision;
    reasons?: string[];
}

// ============================================================================
// Type Guards
// ============================================================================

export function isValidDecision(value: any): value is Decision {
    return typeof value === 'string' &&
        ['allow', 'deny', 'block', 'confirm', 'redact'].includes(value);
}

export function isValidProvider(value: any): value is Provider {
    return typeof value === 'string' &&
        ['openai', 'ollama', 'anthropic', 'google'].includes(value);
}

// ============================================================================
// External User Memory Types
// For external applications using their own user IDs
// ============================================================================

/**
 * Parameters for storing memory with an external user ID
 */
export interface StoreMemoryParams {
    /** External application's user ID */
    externalUserId: string;
    /** Source system identifier (e.g., 'shopify', 'stripe', 'custom') */
    externalSource?: string;
    /** Memory content to store */
    content: string;
    /** Type of content (default: 'user_message') */
    contentType?: string;
    /** Agent or application identifier */
    agentId?: string;
    /** Human-readable agent name */
    agentName?: string;
    /** Additional metadata */
    metadata?: Record<string, any>;
    /** Memory scope ('user' or 'org') */
    scope?: 'user' | 'org';
    /** Visibility level */
    visibility?: 'private' | 'team' | 'org';
    /** Email for auto-created users */
    email?: string;
    /** Name for auto-created users */
    name?: string;
}

/**
 * Parameters for searching memories with an external user ID
 */
export interface SearchMemoryParams {
    /** External application's user ID */
    externalUserId: string;
    /** Source system identifier */
    externalSource?: string;
    /** Search query */
    query: string;
    /** Agent or application identifier */
    agentId?: string;
    /** Filter by content types */
    contentTypes?: string[];
    /** Maximum number of results */
    limit?: number;
    /** Similarity threshold (0-1) */
    threshold?: number;
    /** Search scope */
    scope?: 'user' | 'org' | 'both';
}

/**
 * Memory search result
 */
export interface MemorySearchResult {
    /** Search success status */
    success: boolean;
    /** Found memories */
    memories: Array<{
        id: string;
        content: string;
        summary?: string;
        contentType: string;
        agentId?: string;
        createdAt: string;
        metadata?: Record<string, any>;
        similarity?: number;
    }>;
    /** Total number of results */
    count: number;
    /** Search metadata */
    metadata?: {
        highConfidence?: number;
        mediumConfidence?: number;
        lowConfidence?: number;
        tokenEstimate?: number;
    };
}

/**
 * Resolved user information
 */
export interface ResolvedUser {
    /** Internal user ID in GovernsAI system */
    internalUserId: string;
    /** Whether the user was created during resolution */
    created: boolean;
    /** User details */
    user: {
        id: string;
        email: string;
        name: string | null;
        externalId: string | null;
        externalSource: string | null;
    };
}

// ============================================================================
// Document Management Types
// ============================================================================ 

export type DocumentUploadFile =
    | Buffer
    | Uint8Array
    | ArrayBuffer
    | {
        name?: string;
        type?: string;
        arrayBuffer?: () => Promise<ArrayBuffer>;
    };

export interface DocumentUploadParams {
    /** File to upload (Buffer, ArrayBuffer, Uint8Array, or File-like) */
    file: DocumentUploadFile;
    /** Optional filename override */
    filename?: string;
    /** Optional content type override */
    contentType?: string;
    /** External application's user ID */
    externalUserId?: string;
    /** Source system identifier */
    externalSource?: string;
    /** Additional metadata stored on chunks */
    metadata?: Record<string, any>;
    /** Document scope ('user' or 'org') */
    scope?: 'user' | 'org';
    /** Visibility level */
    visibility?: 'private' | 'team' | 'org';
    /** Email for auto-created users */
    email?: string;
    /** Name for auto-created users */
    name?: string;
    /** Processing mode override ('sync' or 'async') */
    processingMode?: 'sync' | 'async';
}

export interface DocumentUploadResponse {
    success: boolean;
    documentId: string;
    status: 'processing' | 'completed' | 'failed';
    chunkCount: number;
    fileHash: string;
}

export interface DocumentChunk {
    id: string;
    chunkIndex: number;
    content: string;
    metadata: Record<string, any>;
    createdAt: string;
}

export interface DocumentRecord {
    id: string;
    userId: string;
    orgId: string;
    externalUserId?: string | null;
    externalSource?: string | null;
    filename: string;
    contentType: string;
    fileSize: number;
    fileHash: string;
    storageUrl?: string | null;
    status: string;
    errorMessage?: string | null;
    chunkCount: number;
    scope: string;
    visibility: string;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string | null;
}

export interface DocumentDetails extends DocumentRecord {
    content?: string | null;
    chunks?: DocumentChunk[];
}

export interface DocumentListResponse {
    success: boolean;
    documents: DocumentRecord[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
        totalPages: number;
        currentPage: number;
    };
}

export interface DocumentSearchParams {
    query: string;
    userId?: string;
    externalUserId?: string;
    externalSource?: string;
    documentIds?: string[];
    contentTypes?: string[];
    limit?: number;
    threshold?: number;
}

export interface DocumentSearchResult {
    documentId: string;
    chunkId: string;
    chunkIndex: number;
    content: string;
    similarity: number;
    metadata: Record<string, any>;
    document: {
        filename: string;
        contentType: string;
        userId: string;
        externalUserId?: string | null;
        externalSource?: string | null;
        createdAt: string;
    };
}

export interface DocumentSearchResponse {
    success: boolean;
    results: DocumentSearchResult[];
}
