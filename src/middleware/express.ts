// SPDX-License-Identifier: MIT
/**
 * Express middleware — runs every request body through GovernsAI precheck
 * before your route handler sees it.
 *
 * Usage:
 *
 *   import express from 'express';
 *   import { governsExpress } from '@governs-ai/sdk/middleware/express';
 *
 *   const app = express();
 *   app.use(express.json());
 *   app.use(governsExpress({
 *     apiKey: process.env.GOVERNS_AI_API_KEY!,
 *     baseUrl: process.env.GOVERNS_AI_BASE_URL ?? 'http://localhost:8082',
 *     pickInput: (req) => req.body?.prompt ?? '',
 *     // Optional: skip prechecks on some paths.
 *     skip: (req) => req.path.startsWith('/health'),
 *   }));
 *
 * Behavior:
 *  - decision === 'deny'    → respond 403 with reasons, do NOT call next()
 *  - decision === 'transform' → mutate the picked field in `req.body` to the
 *                                redacted text, then call next()
 *  - decision === 'allow'   → just call next()
 *  - on any precheck error  → behavior driven by `onError` (default 'block')
 *
 * Adds `req.governsPrecheck` containing the full PrecheckResult for downstream.
 */
import type { PrecheckCallOptions, PrecheckResult } from './precheck-fetch';
import { callPrecheck } from './precheck-fetch';

export type ExpressLikeReq = {
    body?: any;
    path?: string;
    headers?: Record<string, string | string[] | undefined>;
    [k: string]: any;
};
export type ExpressLikeRes = {
    status(code: number): ExpressLikeRes;
    json(body: any): void;
    setHeader?(name: string, value: string): void;
    [k: string]: any;
};
export type NextFn = (err?: any) => void;

export interface GovernsExpressOptions extends Omit<PrecheckCallOptions, 'tool' | 'rawText'> {
    /** Pick the input text from the request. Default: req.body?.input ?? req.body?.prompt ?? '' */
    pickInput?: (req: ExpressLikeReq) => string;
    /** Pick the tool name. Default: 'chat'. */
    pickTool?: (req: ExpressLikeReq) => string;
    /** Skip precheck for this request (e.g. health endpoints). */
    skip?: (req: ExpressLikeReq) => boolean;
    /** What to do on precheck call failure. 'block' (default) = 503; 'pass' = let through. */
    onError?: 'block' | 'pass';
    /** Where to write the transformed text back into req.body. Default: same key as pickInput pulled from. */
    writeBackKey?: string;
}

const DEFAULT_PICK = (req: ExpressLikeReq): string =>
    (req.body && (req.body.input ?? req.body.prompt ?? req.body.text)) ?? '';

const DEFAULT_TOOL = (_req: ExpressLikeReq): string => 'chat';

export function governsExpress(options: GovernsExpressOptions) {
    const pickInput = options.pickInput ?? DEFAULT_PICK;
    const pickTool = options.pickTool ?? DEFAULT_TOOL;
    const onError = options.onError ?? 'block';

    return async function governsMiddleware(req: ExpressLikeReq, res: ExpressLikeRes, next: NextFn): Promise<void> {
        try {
            if (options.skip && options.skip(req)) return next();

            const rawText = pickInput(req);
            if (!rawText) return next(); // nothing to check

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
                if (onError === 'pass') return next();
                res.status(503).json({
                    error: 'governance_precheck_unavailable',
                    detail: (err as Error)?.message ?? 'unknown',
                });
                return;
            }

            // Surface decision on response headers for downstream observability.
            if (typeof res.setHeader === 'function') {
                res.setHeader('x-governs-decision', result.decision);
                if (result.policyId) res.setHeader('x-governs-policy', result.policyId);
            }
            (req as any).governsPrecheck = result;

            switch (result.decision) {
                case 'deny':
                    res.status(403).json({
                        error: 'governance_denied',
                        reasons: result.reasons,
                        policyId: result.policyId,
                    });
                    return;
                case 'transform': {
                    // write redacted text back into req.body
                    if (req.body && typeof req.body === 'object') {
                        const key = options.writeBackKey
                            ?? (req.body.input !== undefined ? 'input'
                                : req.body.prompt !== undefined ? 'prompt'
                                : req.body.text !== undefined ? 'text'
                                : null);
                        if (key) req.body[key] = result.rawTextOut;
                    }
                    return next();
                }
                case 'allow':
                case 'confirm':
                default:
                    return next();
            }
        } catch (e) {
            return next(e);
        }
    };
}
