/**
 * Tests for the Express middleware. Stubs fetch to return controlled
 * precheck responses, then asserts request flow.
 */
import { governsExpress } from '../middleware/express';

function makeReq(body: any = {}, path = '/api/chat'): any {
    return { body, path, headers: {} };
}

function makeRes(): any {
    const calls: { status?: number; json?: any; headers: Record<string, string> } = { headers: {} };
    return {
        calls,
        status(c: number) { calls.status = c; return this; },
        json(b: any) { calls.json = b; },
        setHeader(k: string, v: string) { calls.headers[k] = v; },
    };
}

function fakeFetch(decision: string, rawTextOut = '', reasons: string[] = [], policyId?: string) {
    return jest.fn(async (_url: any, _init: any) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
            decision, raw_text_out: rawTextOut, reasons, policy_id: policyId,
        }),
    }));
}

describe('governsExpress middleware', () => {
    it('passes through with no input', async () => {
        const mw = governsExpress({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('allow') as any,
        });
        const req = makeReq({}); const res = makeRes(); const next = jest.fn();
        await mw(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.calls.status).toBeUndefined();
    });

    it('skips when skip() returns true', async () => {
        const fetchSpy = fakeFetch('allow');
        const mw = governsExpress({
            apiKey: 'k', baseUrl: 'http://t',
            skip: () => true,
            fetchImpl: fetchSpy as any,
        });
        const req = makeReq({ prompt: 'x' }); const res = makeRes(); const next = jest.fn();
        await mw(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 403 on deny', async () => {
        const mw = governsExpress({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('deny', '', ['pii.email'], 'p-1') as any,
        });
        const req = makeReq({ prompt: 'jane@example.com' }); const res = makeRes(); const next = jest.fn();
        await mw(req, res, next);
        expect(res.calls.status).toBe(403);
        expect(res.calls.json).toMatchObject({
            error: 'governance_denied',
            reasons: ['pii.email'],
            policyId: 'p-1',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('rewrites body on transform and calls next', async () => {
        const mw = governsExpress({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('transform', 'contact me at <EMAIL>') as any,
        });
        const req = makeReq({ prompt: 'contact me at jane@example.com' });
        const res = makeRes(); const next = jest.fn();
        await mw(req, res, next);
        expect(req.body.prompt).toBe('contact me at <EMAIL>');
        expect(next).toHaveBeenCalled();
        expect(res.calls.headers['x-governs-decision']).toBe('transform');
    });

    it('passes through on allow', async () => {
        const mw = governsExpress({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: fakeFetch('allow') as any,
        });
        const req = makeReq({ prompt: 'hi' }); const res = makeRes(); const next = jest.fn();
        await mw(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('returns 503 on precheck error when onError=block', async () => {
        const failingFetch = jest.fn(async () => { throw new Error('econnrefused'); });
        const mw = governsExpress({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: failingFetch as any,
            onError: 'block',
        });
        const req = makeReq({ prompt: 'hi' }); const res = makeRes(); const next = jest.fn();
        await mw(req, res, next);
        expect(res.calls.status).toBe(503);
        expect(next).not.toHaveBeenCalled();
    });

    it('passes through on precheck error when onError=pass', async () => {
        const failingFetch = jest.fn(async () => { throw new Error('boom'); });
        const mw = governsExpress({
            apiKey: 'k', baseUrl: 'http://t',
            fetchImpl: failingFetch as any,
            onError: 'pass',
        });
        const req = makeReq({ prompt: 'hi' }); const res = makeRes(); const next = jest.fn();
        await mw(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('uses custom pickInput and pickTool', async () => {
        const fetchSpy = fakeFetch('allow');
        const mw = governsExpress({
            apiKey: 'k', baseUrl: 'http://t',
            pickInput: (req) => req.body.message,
            pickTool: () => 'agent.call',
            fetchImpl: fetchSpy as any,
        });
        const req = makeReq({ message: 'check this' }); const res = makeRes(); const next = jest.fn();
        await mw(req, res, next);
        expect(fetchSpy).toHaveBeenCalled();
        const call = fetchSpy.mock.calls[0]!;
        const body = JSON.parse((call[1] as any).body);
        expect(body.tool).toBe('agent.call');
        expect(body.raw_text).toBe('check this');
    });
});
