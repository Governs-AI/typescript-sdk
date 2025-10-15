/**
 * Utility functions for GovernsAI SDK
 * HTTP client, retry logic, and common utilities
 */

import { GovernsAIError, isRetryableError, getRetryDelay, RetryConfig } from './errors';
import { GovernsAIConfig, HTTPResponse } from './types';

// Re-export RetryConfig for convenience
export { RetryConfig } from './errors';

// ============================================================================
// HTTP Client Utilities
// ============================================================================

export class HTTPClient {
    private config: GovernsAIConfig;
    private defaultHeaders: Record<string, string>;

    constructor(config: GovernsAIConfig) {
        this.config = config;
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            'X-Governs-Key': config.apiKey,
        };
    }

    async request<T = any>(
        endpoint: string,
        // Use any to avoid DOM lib dependency in non-browser builds
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options: any = {}
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestOptions: any = {
            ...options,
            headers: {
                ...this.defaultHeaders,
                ...options.headers,
            },
            // optional in Node; AbortSignal may not exist in some targets
            signal: (globalThis as any).AbortSignal?.timeout?.(this.config.timeout || 30000),
        };

        try {
            const fetchFn = (globalThis as any).fetch as any;
            if (!fetchFn) {
                throw new GovernsAIError('fetch is not available in this environment');
            }
            const response = await fetchFn(url, requestOptions);
            const data = await response.json().catch(() => null);

            const httpResponse: HTTPResponse = {
                status: response.status,
                statusText: response.statusText,
                data,
                headers: Object.fromEntries(response.headers.entries()),
            };

            if (!response.ok) {
                throw new GovernsAIError(
                    (data as any)?.error || (data as any)?.message || `HTTP ${response.status} ${response.statusText}`,
                    response.status,
                    httpResponse,
                    response.status >= 500 || response.status === 429
                );
            }

            return data as T;
        } catch (error) {
            if (error instanceof GovernsAIError) {
                throw error;
            }

            throw new GovernsAIError(
                error instanceof Error ? error.message : 'Network error',
                undefined,
                undefined,
                isRetryableError(error as Error)
            );
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get<T = any>(endpoint: string, options: any = {}): Promise<T> {
        return this.request<T>(endpoint, { ...options, method: 'GET' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async post<T = any>(endpoint: string, data?: any, options: any = {}): Promise<T> {
        return this.request<T>(endpoint, {
            ...options,
            method: 'POST',
            ...(data && { body: JSON.stringify(data) }),
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async put<T = any>(endpoint: string, data?: any, options: any = {}): Promise<T> {
        return this.request<T>(endpoint, {
            ...options,
            method: 'PUT',
            ...(data && { body: JSON.stringify(data) }),
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async delete<T = any>(endpoint: string, options: any = {}): Promise<T> {
        return this.request<T>(endpoint, { ...options, method: 'DELETE' });
    }
}

// ============================================================================
// Retry Logic
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c: any = (globalThis as any).console;
            if (c?.warn) c.warn(`${context} failed (attempt ${attempt}/${config.maxRetries}), retrying in ${delay}ms:`, error);

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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique correlation ID
 */
export function generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function sleep(ms: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st: any = (globalThis as any).setTimeout;
    return new Promise(resolve => st(resolve, ms));
}

export function validateConfig(config: GovernsAIConfig): void {
    if (!config.apiKey) {
        throw new GovernsAIError('API key is required');
    }

    if (config.baseUrl && !isValidUrl(config.baseUrl)) {
        throw new GovernsAIError('Invalid baseUrl format');
    }

    if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
        throw new GovernsAIError('Timeout must be between 1000ms and 300000ms');
    }

    if (config.retries && (config.retries < 0 || config.retries > 10)) {
        throw new GovernsAIError('Retries must be between 0 and 10');
    }
}

export function isValidUrl(url: string): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const URLCtor = (globalThis as any).URL;
        if (!URLCtor) return false;
        new URLCtor(url);
        return true;
    } catch {
        return false;
    }
}

export function mergeConfig(
    defaultConfig: GovernsAIConfig,
    userConfig: Partial<GovernsAIConfig>
): GovernsAIConfig {
    return {
        timeout: 30000,
        retries: 3,
        retryDelay: 1000,
        ...defaultConfig,
        ...userConfig,
    };
}

// ============================================================================
// Query Parameter Utilities
// ============================================================================

export function buildQueryString(params: Record<string, any>): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SearchParams: any = (globalThis as any).URLSearchParams;
    if (!SearchParams) return '';
    const searchParams = new SearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
                value.forEach(item => searchParams.append(key, String(item)));
            } else {
                searchParams.append(key, String(value));
            }
        }
    });

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
}

export function parseQueryParams(url: string): Record<string, string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const URLCtor: any = (globalThis as any).URL;
    if (!URLCtor) return {};
    const urlObj = new URLCtor(url);
    const params: Record<string, string> = {};

    urlObj.searchParams.forEach((value: string, key: string) => {
        params[key] = value;
    });

    return params;
}

// ============================================================================
// Date and Time Utilities
// ============================================================================

export function formatDate(date: Date): string {
    return date.toISOString();
}

export function parseDate(dateString: string): Date {
    return new Date(dateString);
}

export function getTimeRange(timeRange: string): { start: Date; end: Date } {
    const now = new Date();
    const end = now;
    let start: Date;

    switch (timeRange) {
        case '1h':
            start = new Date(now.getTime() - 60 * 60 * 1000);
            break;
        case '24h':
        case '1d':
            start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case '90d':
            start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
        case '1y':
            start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
        default:
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { start, end };
}

// ============================================================================
// Data Validation Utilities
// ============================================================================

export function validateRequired<T>(
    value: T | undefined,
    fieldName: string
): T {
    if (value === undefined || value === null) {
        throw new GovernsAIError(`${fieldName} is required`);
    }
    return value;
}

export function validateString(value: any, fieldName: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new GovernsAIError(`${fieldName} must be a non-empty string`);
    }
    return value.trim();
}

export function validateNumber(value: any, fieldName: string, min?: number, max?: number): number {
    const num = Number(value);
    if (isNaN(num)) {
        throw new GovernsAIError(`${fieldName} must be a valid number`);
    }
    if (min !== undefined && num < min) {
        throw new GovernsAIError(`${fieldName} must be at least ${min}`);
    }
    if (max !== undefined && num > max) {
        throw new GovernsAIError(`${fieldName} must be at most ${max}`);
    }
    return num;
}

export function validateArray<T>(
    value: any,
    fieldName: string,
    validator?: (item: any) => T
): T[] {
    if (!Array.isArray(value)) {
        throw new GovernsAIError(`${fieldName} must be an array`);
    }

    if (validator) {
        return value.map((item, index) => {
            try {
                return validator(item);
            } catch (error) {
                throw new GovernsAIError(`${fieldName}[${index}] is invalid: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        });
    }

    return value;
}

// ============================================================================
// Deep Merge Utilities
// ============================================================================

export function deepMerge<T extends Record<string, any>>(
    target: T,
    source: Partial<T>
): T {
    const result = { ...target };

    Object.keys(source).forEach(key => {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (
            sourceValue &&
            typeof sourceValue === 'object' &&
            !Array.isArray(sourceValue) &&
            targetValue &&
            typeof targetValue === 'object' &&
            !Array.isArray(targetValue)
        ) {
            (result as any)[key] = deepMerge(targetValue, sourceValue);
        } else {
            (result as any)[key] = sourceValue;
        }
    });

    return result;
}

// ============================================================================
// Logging Utilities
// ============================================================================

export interface Logger {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
}

export class ConsoleLogger implements Logger {
    constructor(private level: 'debug' | 'info' | 'warn' | 'error' = 'info') { }

    debug(message: string, ...args: any[]): void {
        if (this.shouldLog('debug')) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c: any = (globalThis as any).console;
            c?.debug && c.debug(`[GovernsAI SDK] ${message}`, ...args);
        }
    }

    info(message: string, ...args: any[]): void {
        if (this.shouldLog('info')) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c: any = (globalThis as any).console;
            c?.info && c.info(`[GovernsAI SDK] ${message}`, ...args);
        }
    }

    warn(message: string, ...args: any[]): void {
        if (this.shouldLog('warn')) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c: any = (globalThis as any).console;
            c?.warn && c.warn(`[GovernsAI SDK] ${message}`, ...args);
        }
    }

    error(message: string, ...args: any[]): void {
        if (this.shouldLog('error')) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c: any = (globalThis as any).console;
            c?.error && c.error(`[GovernsAI SDK] ${message}`, ...args);
        }
    }

    private shouldLog(level: string): boolean {
        const levels = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }
}

export const defaultLogger = new ConsoleLogger('info');
