/**
 * Tests for GovernsAIClient
 */

import { GovernsAIClient } from '../client';
import { GovernsAIError } from '../errors';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('GovernsAIClient', () => {
    let client: GovernsAIClient;

    beforeEach(() => {
        jest.clearAllMocks();

        client = new GovernsAIClient({
            apiKey: 'test-api-key',
            baseUrl: 'http://example.com',
            orgId: 'test-org',
        });
    });

    describe('constructor', () => {
        it('should create client with valid config', () => {
            expect(client).toBeInstanceOf(GovernsAIClient);
            expect(client.getConfig().apiKey).toBe('test-api-key');
            expect(client.getConfig().baseUrl).toBe('http://example.com');
        });

        it('should throw error for missing API key', () => {
            expect(() => {
                new GovernsAIClient({ apiKey: '', orgId: '' });
            }).toThrow(GovernsAIError);
        });

        it('should use default values for optional config', () => {
            const client = new GovernsAIClient({ apiKey: 'test-key', orgId: 'test-org' });
            const config = client.getConfig();

            expect(config.baseUrl).toBe('http://localhost:3002');
            expect(config.timeout).toBe(30000);
            expect(config.retries).toBe(3);
        });
    });

    describe('testConnection', () => {
        it('should return true for successful connection', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: 'user-123' }),
            } as Response);

            const result = await client.testConnection();
            expect(result).toBe(true);
        });

        it('should return false for failed connection', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await client.testConnection();
            expect(result).toBe(false);
        });
    });

    describe('updateConfig', () => {
        it('should update client configuration', () => {
            client.updateConfig({ timeout: 60000 });

            const config = client.getConfig();
            expect(config.timeout).toBe(60000);
        });

        it('should validate new configuration', () => {
            expect(() => {
                client.updateConfig({ apiKey: '' });
            }).toThrow(GovernsAIError);
        });
    });

    describe('precheck', () => {
        it('should call precheck with correct parameters', async () => {
            const mockResponse = {
                decision: 'allow',
                reasons: [],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            } as Response);

            const request = {
                tool: 'model.chat',
                scope: 'net.external',
                raw_text: 'Hello',
            };

            const result = await client.precheckRequest(request, 'test-user');

            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.com/api/v1/precheck',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'X-Governs-Key': 'test-api-key',
                    }),
                })
            );
        });
    });

    describe('getBudgetContext', () => {
        it('should fetch budget context', async () => {
            const mockResponse = {
                monthly_limit: 1000,
                current_spend: 100,
                remaining_budget: 900,
                budget_type: 'organization',
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            } as Response);

            const result = await client.getBudgetContext('test-user');

            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.com/api/budget/context',
                expect.objectContaining({
                    method: 'GET',
                })
            );
        });
    });

    describe('recordUsage', () => {
        it('should record usage successfully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            } as Response);

            const usage = {
                userId: 'user-123',
                orgId: 'org-456',
                provider: 'openai',
                model: 'gpt-4',
                inputTokens: 100,
                outputTokens: 50,
                cost: 0.15,
                costType: 'external',
            };

            await expect(client.recordUsage(usage)).resolves.not.toThrow();

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.com/api/usage',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify(usage),
                })
            );
        });
    });

    describe('createConfirmation', () => {
        it('should create confirmation request', async () => {
            const mockResponse = {
                success: true,
                confirmation: {
                    id: 'conf-123',
                    correlationId: 'corr-123',
                    requestType: 'tool_call',
                    requestDesc: 'Execute tool',
                    decision: 'confirm',
                    reasons: ['High risk'],
                    status: 'pending',
                    expiresAt: '2024-01-01T00:00:00Z',
                    createdAt: '2024-01-01T00:00:00Z',
                },
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            } as Response);

            const result = await client.createConfirmation(
                'corr-123',
                'tool_call',
                'Execute tool',
                { tool: 'test', args: {} },
                ['High risk']
            );

            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.com/api/v1/confirmation/create',
                expect.objectContaining({
                    method: 'POST',
                })
            );
        });
    });

    describe('getHealthStatus', () => {
        it('should return health status', async () => {
            // Mock all service endpoints
            mockFetch
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response) // precheck
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response) // confirmation
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response) // budget
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response); // analytics

            const result = await client.getHealthStatus();

            expect(result.status).toBe('healthy');
            expect(result.services).toEqual({
                precheck: true,
                confirmation: true,
                budget: true,
                analytics: true,
            });
        });

        it('should return degraded status when some services fail', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response) // precheck
                .mockRejectedValueOnce(new Error('Service unavailable')) // confirmation
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response) // budget
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response); // analytics

            const result = await client.getHealthStatus();

            expect(result.status).toBe('degraded');
            expect(result.services['confirmation']).toBe(false);
        });
    });
});
