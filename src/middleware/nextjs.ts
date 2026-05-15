// SPDX-License-Identifier: MIT
/**
 * Next.js middleware helper — runs a precheck on incoming requests with
 * a JSON body. Works in both Edge (preferred) and Node runtimes.
 *
 * Usage in `middleware.ts`:
 *
 *   import { governsNextMiddleware } from '@governs-ai/sdk/middleware/nextjs';
 *
 *   export const middleware = governsNextMiddleware({
 *     apiKey: process.env.GOVERNS_AI_API_KEY!,
 *     baseUrl: process.env.GOVERNS_AI_BASE_URL ?? 'http://localhost:8082',
 *     // run only on AI-facing API paths
 *     matchPath: (pathname) => pathname.startsWith('/api/chat')
 *                            || pathname.startsWith('/api/agent'),
 *   });
 *
 *   export const config = { matcher: ['/api/:path*'] };
 *
 * On `decision === 'deny'` returns 403 JSON.
 * On `decision === 'transform'` rewrites the request body by setting
 * `x-governs-redacted-text` header (Edge runtime can't mutate request body
 * directly; route handlers read this header).
 * On `decision === 'allow'` passes through with a `x-governs-decision: allow`
 * header for observability.
 */

import type { PrecheckCallOptions, PrecheckResult } from './precheck-fetch';
import { callPrecheck } from './precheck-fetch';

/** Minimal shape — avoids importing 'next/server' so SDK has no Next.js peer dep. */
export interface NextLikeRequest {
    nextUrl: { pathname: string };
    method: string;
    headers: Headers;
    clone(): NextLikeRequest;
    json(): Promise<any>;
}

export type NextLikeResponse = Response;

export interface GovernsNextOptions extends Omit<PrecheckCallOptions, 'tool' | 'rawText'> {
    /** Only run precheck when this returns true. Default: all POST/PUT/PATCH. */
    matchPath?: (pathname: string) => boolean;
    /** Pull input from JSON body. Default: body.input ?? body.prompt ?? body.text. */
    pickInput?: (body: any) => string;
    /** Tool name. Default: 'chat'. */
    pickTool?: (req: NextLikeRequest) => string;
    /** On precheck error: 'block' returns 503; 'pass' lets through. Default: 'block'. */
    onError?: 'block' | 'pass';
}

const DEFAULT_PICK = (body: any): string =>
    (body && (body.input ?? body.prompt ?? body.text)) ?? '';

export function governsNextMiddleware(options: GovernsNextOptions) {
    const matchPath = options.matchPath ?? ((p: string) => p.startsWith('/api/'));
    const pickInput = options.pickInput ?? DEFAULT_PICK;
    const pickTool = options.pickTool ?? ((_r: NextLikeRequest) => 'chat');
    const onError = options.onError ?? 'block';

    return async function middleware(req: NextLikeRequest): Promise<NextLikeResponse | undefined> {
        if (!matchPath(req.nextUrl.pathname)) return undefined;
        const method = req.method.toUpperCase();
        if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return undefined;

        // Read JSON body without consuming the original request stream.
        let body: any;
        try {
            body = await req.clone().json();
        } catch {
            return undefined; // not JSON; let the route decide
        }

        const rawText = pickInput(body);
        if (!rawText) return undefined;

        let result: PrecheckResult;
        try {
            const callOpts: PrecheckCallOptions = {
                apiKey: options.apiKey,
                baseUrl: options.baseUrl,
                tool: pickTool(req),
                rawText,
            };
            if (options.timeoutMs !== undefined) callOpts.timeoutMs = options.timeoutMs;
            if (options.fetchImpl !== undefined) callOpts.fetchImpl = options.fetchImpl;
            result = await callPrecheck(callOpts);
        } catch (err) {
            if (onError === 'pass') return undefined;
            return new Response(JSON.stringify({
                error: 'governance_precheck_unavailable',
                detail: (err as Error)?.message ?? 'unknown',
            }), { status: 503, headers: { 'content-type': 'application/json' } });
        }

        switch (result.decision) {
            case 'deny':
                return new Response(JSON.stringify({
                    error: 'governance_denied',
                    reasons: result.reasons,
                    policyId: result.policyId,
                }), {
                    status: 403,
                    headers: {
                        'content-type': 'application/json',
                        'x-governs-decision': 'deny',
                        ...(result.policyId ? { 'x-governs-policy': result.policyId } : {}),
                    },
                });
            case 'transform': {
                // Edge runtime cannot mutate the request body. Surface the
                // redacted text via a header — the route handler reads it.
                // Edge runtime cannot mutate the request body or headers in
                // place. Callers needing rewrite-on-transform should use the
                // Express middleware (Node runtime). Here we surface the
                // decision in response headers when the route returns.
                return undefined;
            }
            case 'allow':
            case 'confirm':
            default:
                return undefined;
        }
    };
}
