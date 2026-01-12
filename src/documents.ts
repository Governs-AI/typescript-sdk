/**
 * DocumentClient - Document management APIs with OCR + RAG support
 */

import {
    GovernsAIConfig,
    DocumentUploadParams,
    DocumentUploadResponse,
    DocumentDetails,
    DocumentListResponse,
    DocumentSearchParams,
    DocumentSearchResponse,
} from './types';
import { HTTPClient, defaultLogger, Logger, buildQueryString } from './utils';
import { GovernsAIError } from './errors';

export class DocumentClient {
    private httpClient: HTTPClient;
    private config: GovernsAIConfig;
    private logger: Logger;

    constructor(httpClient: HTTPClient, config: GovernsAIConfig) {
        this.httpClient = httpClient;
        this.config = config;
        this.logger = defaultLogger;
    }

    updateConfig(config: GovernsAIConfig): void {
        this.config = config;
    }

    private async normalizeFileInput(params: DocumentUploadParams): Promise<{
        data: any;
        filename: string;
        contentType?: string;
    }> {
        const file = params.file as any;
        const filename = params.filename || file?.name || 'document';
        const contentType = params.contentType || file?.type || undefined;

        const isBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer?.(file);
        const isArrayBuffer = typeof ArrayBuffer !== 'undefined' && file instanceof ArrayBuffer;
        const isTypedArray = typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView?.(file);
        const hasArrayBuffer = typeof file?.arrayBuffer === 'function';

        const blobCtor = (globalThis as any).Blob;

        if (hasArrayBuffer) {
            const raw = new Uint8Array(await file.arrayBuffer());
            const data = blobCtor ? new blobCtor([raw], { type: contentType }) : raw;
            return { data, filename, contentType };
        }

        if (isBuffer || isArrayBuffer || isTypedArray) {
            const raw = isBuffer ? file : (isArrayBuffer ? new Uint8Array(file) : file);
            const data = blobCtor ? new blobCtor([raw], { type: contentType }) : raw;
            return { data, filename, contentType };
        }

        return { data: file, filename, contentType };
    }

    /**
     * Upload a document for OCR + chunking + embeddings
     */
    async uploadDocument(params: DocumentUploadParams): Promise<DocumentUploadResponse> {
        this.logger.debug('Uploading document', {
            filename: params.filename,
            externalUserId: params.externalUserId,
            externalSource: params.externalSource,
        });

        const FormDataCtor = (globalThis as any).FormData;
        if (!FormDataCtor) {
            throw new GovernsAIError('FormData is not available in this environment');
        }

        const form = new FormDataCtor();
        const fileData = await this.normalizeFileInput(params);

        form.append('file', fileData.data, fileData.filename);
        form.append('filename', fileData.filename);
        if (fileData.contentType) form.append('contentType', fileData.contentType);

        if (params.externalUserId) form.append('externalUserId', params.externalUserId);
        if (params.externalSource) form.append('externalSource', params.externalSource);
        if (params.metadata) form.append('metadata', JSON.stringify(params.metadata));
        if (params.scope) form.append('scope', params.scope);
        if (params.visibility) form.append('visibility', params.visibility);
        if (params.email) form.append('email', params.email);
        if (params.name) form.append('name', params.name);
        if (params.processingMode) form.append('processingMode', params.processingMode);

        return this.httpClient.postFormData<DocumentUploadResponse>('/api/v1/documents', form);
    }

    /**
     * Get document status/details
     */
    async getDocument(documentId: string, options?: { includeChunks?: boolean; includeContent?: boolean; }): Promise<DocumentDetails> {
        const query = buildQueryString({
            includeChunks: options?.includeChunks,
            includeContent: options?.includeContent,
        });

        const response = await this.httpClient.get<{ success: boolean; document: DocumentDetails }>(
            `/api/v1/documents/${documentId}${query}`
        );

        return response.document;
    }

    /**
     * List documents for the organization
     */
    async listDocuments(params: {
        userId?: string;
        externalUserId?: string;
        externalSource?: string;
        status?: string;
        contentType?: string;
        includeArchived?: boolean;
        limit?: number;
        offset?: number;
    } = {}): Promise<DocumentListResponse> {
        const query = buildQueryString(params);
        return this.httpClient.get<DocumentListResponse>(`/api/v1/documents${query}`);
    }

    /**
     * Vector search across document chunks
     */
    async searchDocuments(params: DocumentSearchParams): Promise<DocumentSearchResponse> {
        return this.httpClient.post<DocumentSearchResponse>('/api/v1/documents/search', params);
    }

    /**
     * Delete document and associated chunks
     */
    async deleteDocument(documentId: string): Promise<{ success: boolean; deleted: boolean; fileDeleted: boolean }> {
        return this.httpClient.delete(`/api/v1/documents/${documentId}`);
    }
}
