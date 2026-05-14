/**
 * Tests for the Next.js middleware helper.
 */
import { governsNextMiddleware } from '../middleware/nextjs';

function makeReq(opts: { path?: string; method?: string; body?: any; clonedJsonError?: boolean }): any {
    const body = opts.body ?? {};
    const headers = new Headers();
    return {
        nextUrl: { pathname: opts.path ?? '/api/chat' },
        method: opts.method ?? 'POST',
        headers,
        clone() { return this; },
        async json() {
            if (opts.clonedJsonError) throw new Error('not json');
            return body;
        },
    };
}

function fakeFetch(decision: string, rawTextOut = '', reasons: string[] = [], policyId?: string) {
    return jest.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
            decision, raw_text_out: rawTextOut, reasons, policy_id: policyId,
        }),
    }));
}

describe('governsNextMiddleware', () => {
    it('returns undefined for GET requests', async () => {
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('allow') as any,
        });
        const res = await mw(makeReq({ method: 'GET' }));
        expect(res).toBeUndefined();
    });

    it('returns undefined when path does not match', async () => {
        const fetchSpy = fakeFetch('allow');
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            matchPath: (p) => p.startsWith('/api/agent'),
            fetchImpl: fetchSpy as any,
        });
        const res = await mw(makeReq({ path: '/api/chat', body: { prompt: 'hi' } }));
        expect(res).toBeUndefined();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns undefined when body is not JSON', async () => {
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('allow') as any,
        });
        const res = await mw(makeReq({ clonedJsonError: true }));
        expect(res).toBeUndefined();
    });

    it('returns undefined when input is missing', async () => {
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('allow') as any,
        });
        const res = await mw(makeReq({ body: {} }));
        expect(res).toBeUndefined();
    });

    it('returns 403 on deny', async () => {
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('deny', '', ['pii.email'], 'p-1') as any,
        });
        const res = await mw(makeReq({ body: { prompt: 'jane@example.com' } }));
        expect(res).toBeDefined();
        expect(res!.status).toBe(403);
        expect(res!.headers.get('x-governs-decision')).toBe('deny');
        expect(res!.headers.get('x-governs-policy')).toBe('p-1');
        const body = await res!.json();
        expect((body as any).error).toBe('governance_denied');
        expect((body as any).reasons).toEqual(['pii.email']);
    });

    it('returns undefined on transform (lets next continue; header set is on req copy)', async () => {
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('transform', 'redacted') as any,
        });
        const res = await mw(makeReq({ body: { prompt: 'jane@example.com' } }));
        expect(res).toBeUndefined();
    });

    it('returns undefined on allow', async () => {
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('allow') as any,
        });
        const res = await mw(makeReq({ body: { prompt: 'hi' } }));
        expect(res).toBeUndefined();
    });

    it('returns 503 on precheck error when onError=block (default)', async () => {
        const failingFetch = jest.fn(async () => { throw new Error('boom'); });
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: failingFetch as any,
        });
        const res = await mw(makeReq({ body: { prompt: 'hi' } }));
        expect(res!.status).toBe(503);
    });

    it('returns undefined on precheck error when onError=pass', async () => {
        const failingFetch = jest.fn(async () => { throw new Error('boom'); });
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: failingFetch as any,
            onError: 'pass',
        });
        const res = await mw(makeReq({ body: { prompt: 'hi' } }));
        expect(res).toBeUndefined();
    });

    it('uses custom pickInput', async () => {
        const fetchSpy = fakeFetch('allow');
        const mw = governsNextMiddleware({
            apiKey: 'k', baseUrl: 'http://t',
            pickInput: (b) => b.message,
            fetchImpl: fetchSpy as any,
        });
        await mw(makeReq({ body: { message: 'hello' } }));
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const call = (fetchSpy.mock.calls as any[])[0] as any[];
        const body = JSON.parse(call[1].body);
        expect(body.raw_text).toBe('hello');
    });
});
