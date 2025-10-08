/**
 * Error handling for GovernsAI SDK
 * Comprehensive error types with retry logic support
 */

import { HTTPResponse } from './types';

export interface RetryConfig {
    maxRetries: number;
    retryDelay: number;
    retryCondition: (error: Error) => boolean;
}

// ============================================================================
// Base Error Classes
// ============================================================================

export class GovernsAIError extends Error {
    public readonly statusCode?: number;
    public readonly response?: HTTPResponse;
    public readonly retryable?: boolean;

    constructor(
        message: string,
        statusCode?: number,
        response?: HTTPResponse,
        retryable?: boolean
    ) {
        super(message);
        this.name = 'GovernsAIError';
        if (statusCode !== undefined) this.statusCode = statusCode;
        if (response !== undefined) this.response = response;
        if (retryable !== undefined) this.retryable = retryable;
    }
}

export class PrecheckError extends GovernsAIError {
    constructor(
        message: string,
        statusCode?: number,
        response?: HTTPResponse,
        retryable?: boolean
    ) {
        super(message, statusCode, response, retryable);
        this.name = 'PrecheckError';
    }
}

export class ConfirmationError extends GovernsAIError {
    constructor(
        message: string,
        statusCode?: number,
        response?: HTTPResponse,
        retryable?: boolean
    ) {
        super(message, statusCode, response, retryable);
        this.name = 'ConfirmationError';
    }
}

export class BudgetError extends GovernsAIError {
    constructor(
        message: string,
        statusCode?: number,
        response?: HTTPResponse,
        retryable?: boolean
    ) {
        super(message, statusCode, response, retryable);
        this.name = 'BudgetError';
    }
}

export class AuthenticationError extends GovernsAIError {
    constructor(
        message: string,
        statusCode?: number,
        response?: HTTPResponse,
        retryable?: boolean
    ) {
        super(message, statusCode, response, retryable);
        this.name = 'AuthenticationError';
    }
}

export class ToolError extends GovernsAIError {
    constructor(
        message: string,
        statusCode?: number,
        response?: HTTPResponse,
        retryable?: boolean
    ) {
        super(message, statusCode, response, retryable);
        this.name = 'ToolError';
    }
}

export class AnalyticsError extends GovernsAIError {
    constructor(
        message: string,
        statusCode?: number,
        response?: HTTPResponse,
        retryable?: boolean
    ) {
        super(message, statusCode, response, retryable);
        this.name = 'AnalyticsError';
    }
}

// ============================================================================
// Error Factory Functions
// ============================================================================

export function createErrorFromResponse(
    response: HTTPResponse,
    _context: string
): GovernsAIError {
    const { status, data } = response;

    let error: GovernsAIError;
    const message = data?.error || data?.message || `HTTP ${status} ${response.statusText}`;
    const retryable = isRetryableStatus(status);

    switch (status) {
        case 401:
        case 403:
            error = new AuthenticationError(message, status, response, false);
            break;
        case 404:
            error = new GovernsAIError(message, status, response, false);
            break;
        case 429:
        case 500:
        case 502:
        case 503:
        case 504:
            error = new GovernsAIError(message, status, response, true);
            break;
        default:
            error = new GovernsAIError(message, status, response, retryable);
    }

    return error;
}

export function createPrecheckError(
    message: string,
    statusCode?: number,
    response?: HTTPResponse
): PrecheckError {
    return new PrecheckError(
        message,
        statusCode,
        response,
        isRetryableStatus(statusCode)
    );
}

export function createConfirmationError(
    message: string,
    statusCode?: number,
    response?: HTTPResponse
): ConfirmationError {
    return new ConfirmationError(
        message,
        statusCode,
        response,
        isRetryableStatus(statusCode)
    );
}

export function createBudgetError(
    message: string,
    statusCode?: number,
    response?: HTTPResponse
): BudgetError {
    return new BudgetError(
        message,
        statusCode,
        response,
        isRetryableStatus(statusCode)
    );
}

export function createToolError(
    message: string,
    statusCode?: number,
    response?: HTTPResponse
): ToolError {
    return new ToolError(
        message,
        statusCode,
        response,
        isRetryableStatus(statusCode)
    );
}

export function createAnalyticsError(
    message: string,
    statusCode?: number,
    response?: HTTPResponse
): AnalyticsError {
    return new AnalyticsError(
        message,
        statusCode,
        response,
        isRetryableStatus(statusCode)
    );
}

export function createAuthenticationError(
    message: string,
    statusCode?: number,
    response?: HTTPResponse
): AuthenticationError {
    return new AuthenticationError(message, statusCode, response, false);
}

// ============================================================================
// Retry Logic Utilities
// ============================================================================

export function isRetryableStatus(status?: number): boolean {
    if (!status) return false;

    return status === 429 || // Rate limited
        status === 500 || // Internal server error
        status === 502 || // Bad gateway
        status === 503 || // Service unavailable
        status === 504;   // Gateway timeout
}

export function isRetryableError(error: Error): boolean {
    if (error instanceof GovernsAIError) {
        return error.retryable === true;
    }

    // Network errors are typically retryable
    return error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('timeout') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ENOTFOUND');
}

export function getRetryDelay(attempt: number, baseDelay: number = 1000): number {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
}

// ============================================================================
// Error Message Utilities
// ============================================================================

export function formatErrorMessage(
    operation: string,
    error: Error,
    context?: Record<string, any>
): string {
    const contextStr = context ? ` (${JSON.stringify(context)})` : '';
    return `${operation} failed${contextStr}: ${error instanceof Error ? error.message : "Unknown error"}`;
}

export function extractErrorDetails(error: any): {
    message: string;
    statusCode?: number;
    retryable: boolean;
    context?: any;
} {
    if (error instanceof GovernsAIError) {
        return {
            message: error instanceof Error ? error.message : "Unknown error",
            ...(error.statusCode !== undefined && { statusCode: error.statusCode }),
            retryable: error.retryable || false,
            ...(error.response?.data !== undefined && { context: error.response.data }),
        };
    }

    return {
        message: error?.message || 'Unknown error',
        retryable: isRetryableError(error),
    };
}

// ============================================================================
// Error Categories
// ============================================================================

export enum ErrorCategory {
    NETWORK = 'network',
    AUTHENTICATION = 'authentication',
    AUTHORIZATION = 'authorization',
    VALIDATION = 'validation',
    RATE_LIMIT = 'rate_limit',
    SERVER_ERROR = 'server_error',
    CLIENT_ERROR = 'client_error',
    UNKNOWN = 'unknown',
}

export function categorizeError(error: Error): ErrorCategory {
    if (error instanceof AuthenticationError) {
        return ErrorCategory.AUTHENTICATION;
    }

    if (error instanceof GovernsAIError) {
        const status = error.statusCode;
        if (status === 401) return ErrorCategory.AUTHENTICATION;
        if (status === 403) return ErrorCategory.AUTHORIZATION;
        if (status === 400 || status === 422) return ErrorCategory.VALIDATION;
        if (status === 429) return ErrorCategory.RATE_LIMIT;
        if (status && status >= 500) return ErrorCategory.SERVER_ERROR;
        if (status && status >= 400) return ErrorCategory.CLIENT_ERROR;
    }

    if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
        return ErrorCategory.NETWORK;
    }

    return ErrorCategory.UNKNOWN;
}

// ============================================================================
// Error Recovery Strategies
// ============================================================================

export interface ErrorRecoveryStrategy {
    canRecover: (error: Error) => boolean;
    recover: (error: Error) => Promise<any>;
}

export class RetryStrategy implements ErrorRecoveryStrategy {
    constructor() { }

    canRecover(error: Error): boolean {
        return isRetryableError(error);
    }

    async recover(_error: Error): Promise<any> {
        // This would be implemented by the calling code
        throw new Error('Retry strategy must be implemented by the caller');
    }
}

export class FallbackStrategy implements ErrorRecoveryStrategy {
    constructor(private fallbackValue: any) { }

    canRecover(_error: Error): boolean {
        return true; // Always can fallback
    }

    async recover(_error: Error): Promise<any> {
        return this.fallbackValue;
    }
}

// ============================================================================
// Retry Logic Implementation
// ============================================================================

export async function withRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    context: string = 'operation'
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;

            if (!config.retryCondition(error as Error)) {
                throw error;
            }

            if (attempt === config.maxRetries) {
                break;
            }

            const delay = getRetryDelay(attempt, config.retryDelay);
            console.warn(`${context} failed (attempt ${attempt}/${config.maxRetries}), retrying in ${delay}ms:`, error);

            await sleep(delay);
        }
    }

    throw new GovernsAIError(
        `${context} failed after ${config.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
        undefined,
        undefined,
        false
    );
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
