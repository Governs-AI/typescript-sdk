// SPDX-License-Identifier: MIT
/**
 * Minimal precheck call via global fetch — no SDK ceremony, no axios.
 *
 * The middleware modules (`express.ts`, `nextjs.ts`) call this instead of
 * instantiating the full PrecheckClient. Keeps the middleware tree-shakeable
 * and free of feature-client overhead.
 */

export type PrecheckDecisionKind = 'allow' | 'transform' | 'deny' | 'confirm';

export interface PrecheckResult {
    decision: PrecheckDecisionKind;
    rawTextOut: string;
    reasons: string[];
    policyId?: string;
    ts?: number;
    /** Raw response body for callers that want everything. */
    raw: Record<string, unknown>;
}

export interface PrecheckCallOptions {
    apiKey: string;
    /** Base URL of the precheck service (e.g. http://localhost:8082 or https://api.governsai.com) */
    baseUrl: string;
    tool: string;
    rawText: string;
    scope?: string;
    userId?: string;
    corrId?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

export class PrecheckHTTPError extends Error {
    public readonly status: number;
    public readonly body: unknown;
    constructor(status: number, message: string, body: unknown) {
        super(`precheck HTTP ${status}: ${message}`);
        this.status = status;
        this.body = body;
    }
}

export async function callPrecheck(opts: PrecheckCallOptions): Promise<PrecheckResult> {
    const f = opts.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
    try {
        const payload: Record<string, unknown> = {
            tool: opts.tool,
            raw_text: opts.rawText,
        };
        if (opts.scope) payload['scope'] = opts.scope;
        if (opts.userId) payload['user_id'] = opts.userId;
        if (opts.corrId) payload['corr_id'] = opts.corrId;

        const res = await f(`${opts.baseUrl.replace(/\/$/, '')}/api/v1/precheck`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-governs-key': opts.apiKey,
            },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
        });
        const txt = await res.text();
        let body: any;
        try { body = txt ? JSON.parse(txt) : {}; } catch { body = txt; }

        if (!res.ok) {
            throw new PrecheckHTTPError(res.status, typeof body === 'string' ? body : (body?.error ?? 'error'), body);
        }
        return {
            decision: (body.decision ?? 'deny') as PrecheckDecisionKind,
            rawTextOut: body.raw_text_out ?? body.rawTextOut ?? '',
            reasons: body.reasons ?? [],
            policyId: body.policy_id ?? body.policyId,
            ts: body.ts,
            raw: body,
        };
    } finally {
        clearTimeout(timer);
    }
}
