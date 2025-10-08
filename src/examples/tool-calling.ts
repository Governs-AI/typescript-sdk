/**
 * Tool Calling Example
 * Demonstrates how to use the SDK with tool calling functionality
 */

import { GovernsAIClient, Tool, ToolCall } from '../index';

class ToolCallingApplication {
    private client: GovernsAIClient;
    private _userId: string;

    constructor(apiKey: string, baseUrl?: string, orgId: string = 'org-456', userId: string = 'user-123') {
        this.client = new GovernsAIClient({
            apiKey,
            baseUrl: baseUrl || 'http://localhost:3002',
            orgId,
        });
        this._userId = userId;
    }

    async executeToolCall(toolCall: ToolCall): Promise<{
        success: boolean;
        result?: any;
        error?: string;
        confirmationRequired?: boolean;
        confirmationUrl?: string;
    }> {
        try {
            // Precheck the tool call
            console.log(`Prechecking tool call for user: ${this._userId}`);
            const precheckResponse = await this.client.precheck.checkToolCall(
                toolCall.function.name,
                JSON.parse(toolCall.function.arguments),
                'net.external'
            );

            console.log('Tool call precheck decision:', precheckResponse.decision);

            switch (precheckResponse.decision) {
                case 'allow':
                    // Execute the tool
                    const result = await this.executeTool(toolCall);

                    // Record usage
                    await this.recordToolUsage(toolCall.function.name);

                    return { success: true, result };

                case 'deny':
                case 'block':
                    return {
                        success: false,
                        error: `Tool call blocked: ${precheckResponse.reasons?.join(', ')}`
                    };

                case 'confirm':
                    // Create confirmation request
                    const confirmation = await this.client.createConfirmation(
                        `tool_${Date.now()}`,
                        'tool_call',
                        `Execute tool: ${toolCall.function.name}`,
                        {
                            tool: toolCall.function.name,
                            args: JSON.parse(toolCall.function.arguments)
                        },
                        precheckResponse.reasons
                    );

                    return {
                        success: false,
                        confirmationRequired: true,
                        confirmationUrl: this.client.confirmation.getConfirmationUrl(confirmation.confirmation.correlationId),
                    };

                case 'redact':
                    // Use redacted arguments
                    const redactedArgs = precheckResponse.content?.args || JSON.parse(toolCall.function.arguments);
                    const redactedToolCall = {
                        ...toolCall,
                        function: {
                            ...toolCall.function,
                            arguments: JSON.stringify(redactedArgs),
                        },
                    };

                    const result2 = await this.executeTool(redactedToolCall);
                    await this.recordToolUsage(toolCall.function.name);

                    return { success: true, result: result2 };

                default:
                    return { success: false, error: 'Unknown decision' };
            }
        } catch (error) {
            console.error('Error executing tool call:', error);
            return { success: false, error: 'Error executing tool call' };
        }
    }

    private async executeTool(toolCall: ToolCall): Promise<any> {
        // This would be your actual tool execution logic
        // For demo purposes, return a mock result
        const args = JSON.parse(toolCall.function.arguments);

        switch (toolCall.function.name) {
            case 'weather_current':
                return {
                    location: args.location_name || 'Unknown',
                    temperature: '22°C',
                    condition: 'Sunny',
                };

            case 'payment_process':
                return {
                    transaction_id: `txn_${Date.now()}`,
                    status: 'completed',
                    amount: args.amount,
                    currency: args.currency || 'USD',
                };

            default:
                return { result: `Mock result for ${toolCall.function.name}`, args };
        }
    }

    private async recordToolUsage(toolName: string): Promise<void> {
        try {
            await this.client.recordUsage({
                userId: 'user-123',
                orgId: 'org-456',
                provider: 'external',
                model: 'tool-execution',
                inputTokens: 0,
                outputTokens: 0,
                cost: 0.01, // Small cost for tool execution
                costType: 'external',
                tool: toolName,
            });
        } catch (error) {
            console.error('Failed to record tool usage:', error);
        }
    }

    async registerTools(tools: Tool[]): Promise<void> {
        try {
            await this.client.tools.registerTools(tools);
            console.log('Tools registered successfully');
        } catch (error) {
            console.error('Failed to register tools:', error);
        }
    }

    async getToolAnalytics(timeRange: string = '30d') {
        try {
            const [toolCalls, toolCosts] = await Promise.all([
                this.client.analytics.getToolCalls({ timeRange, includeStats: true }),
                this.client.analytics.getSpendByTool(timeRange),
            ]);

            return {
                toolCalls: toolCalls.stats,
                toolCosts,
            };
        } catch (error) {
            console.error('Failed to get tool analytics:', error);
            return null;
        }
    }
}

// Example usage
async function toolCallingExample() {
    const toolApp = new ToolCallingApplication('your-api-key');

    // Register some tools
    const tools: Tool[] = [
        {
            type: 'function',
            function: {
                name: 'weather_current',
                description: 'Get current weather for a location',
                parameters: {
                    type: 'object',
                    properties: {
                        latitude: { type: 'number', description: 'Latitude coordinate' },
                        longitude: { type: 'number', description: 'Longitude coordinate' },
                        location_name: { type: 'string', description: 'Location name' },
                    },
                    required: ['latitude', 'longitude'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'payment_process',
                description: 'Process a payment transaction',
                parameters: {
                    type: 'object',
                    properties: {
                        amount: { type: 'number', description: 'Payment amount' },
                        currency: { type: 'string', description: 'Currency code' },
                        method: { type: 'string', description: 'Payment method' },
                    },
                    required: ['amount'],
                },
            },
        },
    ];

    await toolApp.registerTools(tools);

    // Execute a tool call
    const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
            name: 'weather_current',
            arguments: JSON.stringify({
                latitude: 52.52,
                longitude: 13.41,
                location_name: 'Berlin',
            }),
        },
    };

    const result = await toolApp.executeToolCall(toolCall);

    if (result.success) {
        console.log('Tool execution result:', result.result);
    } else if (result.confirmationRequired) {
        console.log('Confirmation required:', result.confirmationUrl);
    } else {
        console.log('Tool execution failed:', result.error);
    }

    // Get tool analytics
    const analytics = await toolApp.getToolAnalytics();
    if (analytics) {
        console.log('Tool analytics:', analytics);
    }
}

// Run the example
if (require.main === module) {
    toolCallingExample();
}
