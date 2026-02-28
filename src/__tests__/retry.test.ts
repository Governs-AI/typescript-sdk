/**
 * TEST-3.6 — TypeScript SDK: retry logic, error types, client construction.
 *
 * Covers gaps not addressed in the existing precheck.test.ts:
 *  - withRetry() respects maxRetries and calls the operation the right number of times
 *  - withRetry() propagates non-retryable errors immediately
 *  - GovernsAIError carries statusCode and retryable flag
 *  - PrecheckError / ToolError are sub-classes of GovernsAIError
 *  - GovernsAIClient constructor rejects invalid configs
 *  - HTTPClient adds X-Governs-Key header on every request
 */

import { GovernsAIClient } from '../client';
import { GovernsAIError, PrecheckError, ToolError, createPrecheckError } from '../errors';
import { HTTPClient } from '../utils';

const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// ---------------------------------------------------------------------------
// Error type hierarchy
// ---------------------------------------------------------------------------

describe('Error type hierarchy', () => {
    it('GovernsAIError is an Error', () => {
        const err = new GovernsAIError('test');
        expect(err).toBeInstanceOf(Error);
    });

    it('GovernsAIError carries statusCode', () => {
        const err = new GovernsAIError('bad request', 400);
        expect(err.statusCode).toBe(400);
    });

    it('GovernsAIError retryable flag defaults to false', () => {
        const err = new GovernsAIError('err');
        expect(err.retryable).toBe(false);
    });

    it('GovernsAIError retryable flag can be set to true', () => {
        const err = new GovernsAIError('err', 503, undefined, true);
        expect(err.retryable).toBe(true);
    });

    it('PrecheckError extends GovernsAIError', () => {
        const err = createPrecheckError('precheck failed');
        expect(err).toBeInstanceOf(GovernsAIError);
        expect(err).toBeInstanceOf(PrecheckError);
    });

    it('PrecheckError name is PrecheckError', () => {
        const err = createPrecheckError('test');
        expect(err.name).toBe('PrecheckError');
    });

    it('ToolError extends GovernsAIError', () => {
        const err = new ToolError('tool failed');
        expect(err).toBeInstanceOf(GovernsAIError);
    });
});

// ---------------------------------------------------------------------------
// GovernsAIClient — constructor validation
// ---------------------------------------------------------------------------

describe('GovernsAIClient constructor', () => {
    it('rejects empty apiKey', () => {
        expect(() => new GovernsAIClient({ apiKey: '', orgId: 'org', baseUrl: 'http://localhost' }))
            .toThrow(GovernsAIError);
    });

    it('accepts valid config', () => {
        expect(() => new GovernsAIClient({ apiKey: 'key', orgId: 'org', baseUrl: 'http://localhost' }))
            .not.toThrow();
    });

    it('exposes config via getConfig()', () => {
        const client = new GovernsAIClient({ apiKey: 'k', orgId: 'o', baseUrl: 'http://x.com' });
        expect(client.getConfig().apiKey).toBe('k');
        expect(client.getConfig().orgId).toBe('o');
    });

    it('applies default timeout if not specified', () => {
        const client = new GovernsAIClient({ apiKey: 'k', orgId: 'o', baseUrl: 'http://x.com' });
        expect(client.getConfig().timeout).toBe(30000);
    });

    it('applies default retries if not specified', () => {
        const client = new GovernsAIClient({ apiKey: 'k', orgId: 'o', baseUrl: 'http://x.com' });
        expect(client.getConfig().retries).toBe(3);
    });

    it('overrides defaults when provided', () => {
        const client = new GovernsAIClient({ apiKey: 'k', orgId: 'o', baseUrl: 'http://x.com', timeout: 5000, retries: 1 });
        expect(client.getConfig().timeout).toBe(5000);
        expect(client.getConfig().retries).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// HTTPClient — sends X-Governs-Key header
// ---------------------------------------------------------------------------

describe('HTTPClient request headers', () => {
    it('includes X-Governs-Key on GET', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { entries: () => [] } as any,
            json: () => Promise.resolve({ ok: true }),
        } as any);

        const client = new HTTPClient({ apiKey: 'my-api-key', baseUrl: 'http://localhost', orgId: 'o' });
        await client.get('/test');

        const [, options] = mockFetch.mock.calls[0];
        expect((options as any).headers['X-Governs-Key']).toBe('my-api-key');
    });

    it('includes Content-Type application/json on POST', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { entries: () => [] } as any,
            json: () => Promise.resolve({}),
        } as any);

        const client = new HTTPClient({ apiKey: 'k', baseUrl: 'http://localhost', orgId: 'o' });
        await client.post('/test', { data: 1 });

        const [, options] = mockFetch.mock.calls[0];
        expect((options as any).headers['Content-Type']).toBe('application/json');
    });

    it('throws GovernsAIError on non-ok response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            headers: { entries: () => [] } as any,
            json: () => Promise.resolve({ error: 'rate limited' }),
        } as any);

        const client = new HTTPClient({ apiKey: 'k', baseUrl: 'http://localhost', orgId: 'o' });
        await expect(client.get('/test')).rejects.toBeInstanceOf(GovernsAIError);
    });

    it('marks 429 and 5xx errors as retryable', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            headers: { entries: () => [] } as any,
            json: () => Promise.resolve({ error: 'unavailable' }),
        } as any);

        const client = new HTTPClient({ apiKey: 'k', baseUrl: 'http://localhost', orgId: 'o' });
        try {
            await client.get('/test');
        } catch (err) {
            expect(err).toBeInstanceOf(GovernsAIError);
            expect((err as GovernsAIError).retryable).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// withRetry — retry count and propagation
// ---------------------------------------------------------------------------

describe('withRetry', () => {
    // Import after mocking to get the real implementation
    const getWithRetry = () => require('../utils').withRetry as typeof import('../utils').withRetry;

    beforeEach(() => {
        jest.resetModules();
    });

    it('returns result on first success', async () => {
        const { withRetry } = await import('../utils');
        const op = jest.fn().mockResolvedValue('ok');
        const result = await withRetry(op, { maxRetries: 3, retryDelay: 1, retryCondition: () => true });
        expect(result).toBe('ok');
        expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries up to maxRetries on retryable error', async () => {
        const { withRetry } = await import('../utils');
        const retryableErr = new GovernsAIError('retry me', 503, undefined, true);
        const op = jest.fn()
            .mockRejectedValueOnce(retryableErr)
            .mockRejectedValueOnce(retryableErr)
            .mockResolvedValue('success');

        const result = await withRetry(op, {
            maxRetries: 3,
            retryDelay: 1,
            retryCondition: (e) => (e as GovernsAIError).retryable === true,
        });

        expect(result).toBe('success');
        expect(op).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-retryable errors', async () => {
        const { withRetry } = await import('../utils');
        const hardErr = new GovernsAIError('hard fail', 400, undefined, false);
        const op = jest.fn().mockRejectedValue(hardErr);

        await expect(
            withRetry(op, { maxRetries: 5, retryDelay: 1, retryCondition: () => false })
        ).rejects.toBeInstanceOf(GovernsAIError);

        // Non-retryable: only called once
        expect(op).toHaveBeenCalledTimes(1);
    });

    it('throws after exhausting all retries', async () => {
        const { withRetry } = await import('../utils');
        const retryableErr = new GovernsAIError('always fails', 503, undefined, true);
        const op = jest.fn().mockRejectedValue(retryableErr);

        await expect(
            withRetry(op, { maxRetries: 3, retryDelay: 1, retryCondition: () => true })
        ).rejects.toBeInstanceOf(GovernsAIError);

        expect(op).toHaveBeenCalledTimes(3);
    });
});

// ---------------------------------------------------------------------------
// block → deny normalization (regression test)
// ---------------------------------------------------------------------------

describe('PrecheckClient decision normalization', () => {
    it('normalizes legacy block to deny via checkRequest', async () => {
        const { PrecheckClient } = await import('../precheck');
        const { GovernsAIError: Err } = await import('../errors');

        const mockHttp = {
            post: jest.fn().mockResolvedValue({ decision: 'block', reasons: ['legacy'] }),
            get: jest.fn().mockRejectedValue(new Err('not found', 404)),
        } as any;

        const client = new PrecheckClient(mockHttp, { apiKey: 'k', baseUrl: 'http://x', orgId: 'o' });
        const result = await client.checkRequest({ tool: 'test', scope: 'local', raw_text: 'hi' });
        expect(result.decision).toBe('deny');
    });
});
