/**
 * Tests for PrecheckClient
 */

import { PrecheckClient } from '../precheck';
import { HTTPClient } from '../utils';
import { PrecheckError } from '../errors';

// Mock HTTPClient
jest.mock('../utils', () => ({
    HTTPClient: jest.fn().mockImplementation(() => ({
        post: jest.fn(),
        get: jest.fn(),
    })),
    defaultLogger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe('PrecheckClient', () => {
    let precheckClient: PrecheckClient;
    let mockHttpClient: jest.Mocked<HTTPClient>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockHttpClient = {
            post: jest.fn(),
            get: jest.fn(),
        } as any;

        precheckClient = new PrecheckClient(mockHttpClient, {
            apiKey: 'test-api-key',
            baseUrl: 'http://localhost:3002',
            orgId: 'test-org',
        });
    });

    describe('checkRequest', () => {
        it('should check request successfully', async () => {
            const mockResponse = {
                decision: 'allow',
                reasons: [],
            };

            mockHttpClient.post.mockResolvedValueOnce(mockResponse);

            const request = {
                tool: 'model.chat',
                scope: 'net.external',
                raw_text: 'Hello',
            };

            const result = await precheckClient.checkRequest(request);

            expect(result).toEqual(mockResponse);
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                '/api/v1/precheck',
                request
            );
        });

        it('should handle precheck errors', async () => {
            mockHttpClient.post.mockRejectedValueOnce(new Error('Network error'));

            const request = {
                tool: 'model.chat',
                scope: 'net.external',
                raw_text: 'Hello',
            };

            await expect(precheckClient.checkRequest(request)).rejects.toThrow(PrecheckError);
        });
    });

    describe('checkToolCall', () => {
        it('should check tool call with correct parameters', async () => {
            const mockResponse = {
                decision: 'allow',
                reasons: [],
            };

            mockHttpClient.post.mockResolvedValueOnce(mockResponse);

            const result = await precheckClient.checkToolCall('weather_current', { location: 'Berlin' });

            expect(result).toEqual(mockResponse);
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                '/api/v1/precheck',
                expect.objectContaining({
                    tool: 'weather_current',
                    scope: 'net.external',
                    payload: { tool: 'weather_current', args: { location: 'Berlin' } },
                    tags: ['sdk', 'tool_call'],
                })
            );
        });
    });

    describe('checkChatMessage', () => {
        it('should check chat message with correct parameters', async () => {
            const mockResponse = {
                decision: 'allow',
                reasons: [],
            };

            mockHttpClient.post.mockResolvedValueOnce(mockResponse);

            const messages = [
                { id: '1', role: 'user' as const, content: 'Hello' },
                { id: '2', role: 'assistant' as const, content: 'Hi there!' },
            ];

            const result = await precheckClient.checkChatMessage(messages, 'openai');

            expect(result).toEqual(mockResponse);
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                '/api/v1/precheck',
                expect.objectContaining({
                    tool: 'model.chat',
                    scope: 'net.external',
                    raw_text: 'Hello',
                    payload: { messages, provider: 'openai' },
                    tags: ['sdk', 'chat'],
                })
            );
        });
    });

    describe('createChatPrecheckRequest', () => {
        it('should create chat precheck request correctly', () => {
            const messages = [
                { id: '1', role: 'user' as const, content: 'Hello' },
                { id: '2', role: 'assistant' as const, content: 'Hi there!' },
            ];

            const request = precheckClient.createChatPrecheckRequest(messages, 'openai', 'corr-123');

            expect(request).toEqual({
                tool: 'model.chat',
                scope: 'net.external',
                raw_text: 'Hello',
                payload: { messages, provider: 'openai' },
                tags: ['sdk', 'chat'],
                corr_id: 'corr-123',
            });
        });
    });

    describe('createMCPPrecheckRequest', () => {
        it('should create MCP precheck request correctly', () => {
            const args = { amount: 100, currency: 'USD' };
            const request = precheckClient.createMCPPrecheckRequest('payment_process', args, 'corr-123');

            expect(request).toEqual({
                tool: 'payment_process',
                scope: 'net.external',
                raw_text: 'MCP Tool Call: payment_process with arguments: {"amount":100,"currency":"USD"}',
                payload: { tool: 'payment_process', args },
                tags: ['sdk', 'mcp'],
                corr_id: 'corr-123',
            });
        });

        it('should enhance tool config for payment tools', () => {
            const args = { amount: 100, currency: 'USD' };
            const toolConfig = {
                tool_name: 'payment_process',
                scope: 'net.external',
                direction: 'both' as const,
                metadata: {
                    category: 'payment',
                    risk_level: 'high' as const,
                },
            };

            const request = precheckClient.createMCPPrecheckRequest(
                'payment_process',
                args,
                'corr-123',
                undefined,
                toolConfig
            );

            expect(request.tool_config?.metadata).toMatchObject({
                purchase_amount: 100,
                amount: 100,
                currency: 'USD',
                description: 'Payment transaction',
            });
        });
    });

    describe('validatePrecheckResponse', () => {
        it('should validate correct response', () => {
            const response = {
                decision: 'allow',
                reasons: [],
            };

            const result = precheckClient.validatePrecheckResponse(response);
            expect(result).toEqual(response);
        });

        it('should throw error for invalid response', () => {
            expect(() => {
                precheckClient.validatePrecheckResponse({});
            }).toThrow(PrecheckError);
        });

        it('should throw error for invalid decision', () => {
            expect(() => {
                precheckClient.validatePrecheckResponse({ decision: 'invalid' });
            }).toThrow(PrecheckError);
        });
    });

    describe('decision helpers', () => {
        it('should correctly identify decision types', () => {
            expect(precheckClient.requiresConfirmation('confirm')).toBe(true);
            expect(precheckClient.requiresConfirmation('allow')).toBe(false);

            expect(precheckClient.isBlocked('block')).toBe(true);
            expect(precheckClient.isBlocked('deny')).toBe(true);
            expect(precheckClient.isBlocked('allow')).toBe(false);

            expect(precheckClient.isAllowed('allow')).toBe(true);
            expect(precheckClient.isAllowed('block')).toBe(false);
        });
    });

    describe('getUserFriendlyError', () => {
        it('should return user-friendly error message', () => {
            const response = {
                decision: 'block',
                reasons: ['Policy violation', 'Technical error message'],
            };

            const error = precheckClient.getUserFriendlyError(response as any);
            expect(error).toBe('Policy violation');
        });

        it('should filter out technical messages', () => {
            const response = {
                decision: 'block',
                reasons: ['Precheck service unavailable', 'Connection failed'],
            };

            const error = precheckClient.getUserFriendlyError(response as any);
            expect(error).toBe('Request blocked by policy');
        });
    });

    describe('batch operations', () => {
        it('should check multiple requests in batch', async () => {
            const mockResponse = {
                decision: 'allow',
                reasons: [],
            };

            mockHttpClient.post.mockResolvedValue(mockResponse);

            const requests = [
                { tool: 'model.chat', scope: 'net.external', raw_text: 'Hello' },
                { tool: 'weather_current', scope: 'net.external', raw_text: 'Weather' },
            ];

            const results = await precheckClient.checkBatch(requests);

            expect(results).toHaveLength(2);
            expect(results[0]).toEqual(mockResponse);
            expect(results[1]).toEqual(mockResponse);
        });

        it('should handle batch errors gracefully', async () => {
            mockHttpClient.post
                .mockResolvedValueOnce({ decision: 'allow', reasons: [] })
                .mockRejectedValueOnce(new Error('Network error'));

            const requests = [
                { tool: 'model.chat', scope: 'net.external', raw_text: 'Hello' },
                { tool: 'weather_current', scope: 'net.external', raw_text: 'Weather' },
            ];

            const results = await precheckClient.checkBatch(requests);

            expect(results).toHaveLength(2);
            expect(results[0]?.decision).toBe('allow');
            expect(results[1]?.decision).toBe('block');
            expect(results[1]?.metadata?.['error']).toBe(true);
        });
    });
});
