/**
 * ToolClient catalog registration against an admin-managed catalog:
 * API keys can read /api/v1/tools but not write it (403).
 */

import { ToolClient } from '../tools';
import { GovernsAIError } from '../errors';
import { defaultLogger } from '../utils';

jest.mock('../utils', () => {
    const actualUtils = jest.requireActual('../utils');
    return {
        ...actualUtils,
        defaultLogger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    };
});

function client() {
    const http = { get: jest.fn(), post: jest.fn() } as any;
    const tools = new ToolClient(http, { apiKey: 'k', baseUrl: 'http://localhost:3002', retries: 0 } as any);
    return { http, tools };
}

beforeEach(() => jest.clearAllMocks());

it('adds only tools the catalog does not have yet', async () => {
    const { http, tools } = client();
    http.get.mockResolvedValue({ tools: [{ toolName: 'payment_process' }] });
    http.post.mockResolvedValue({});

    await tools.registerAgentTools(['payment_process', 'crm_lookup']);

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.mock.calls[0][1]).toMatchObject({ toolName: 'crm_lookup' });
});

it('does not fail when the catalog is read-only for the API key', async () => {
    const { http, tools } = client();
    http.get.mockResolvedValue({ tools: [] });
    http.post.mockRejectedValue(new GovernsAIError('read-only for API keys', 403));

    await expect(tools.registerAgentTools(['crm_lookup', 'erp_sync'])).resolves.toBeUndefined();

    expect(http.post).toHaveBeenCalledTimes(2);
    expect(defaultLogger.warn).toHaveBeenCalledTimes(1);
    expect((defaultLogger.warn as jest.Mock).mock.calls[0][1]).toEqual({ tools: ['crm_lookup', 'erp_sync'] });
});

it('still surfaces other errors', async () => {
    const { http, tools } = client();
    http.get.mockResolvedValue({ tools: [] });
    http.post.mockRejectedValue(new GovernsAIError('boom', 500));

    await expect(tools.registerAgentTools(['crm_lookup'])).rejects.toThrow(/boom/);
});
