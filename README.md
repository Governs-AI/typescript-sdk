# GovernsAI TypeScript SDK

A comprehensive TypeScript SDK for the GovernsAI platform, providing secure control over AI interactions, budget management, and policy enforcement.

## Features

- **Precheck Integration**: Request validation and budget checking before AI calls
- **Confirmation Workflows**: User approval for sensitive operations
- **Budget Management**: Real-time budget checking and usage tracking
- **Tool Management**: Tool registration and metadata handling
- **Analytics**: Comprehensive analytics and monitoring
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Error Handling**: Robust error handling with retry logic
- **Developer Experience**: Easy to use and well-documented

## Installation

```bash
npm install @governs-ai/sdk
```

## Quick Start

```typescript
import { GovernsAIClient, createClientFromEnv } from "@governs-ai/sdk";

// Create client from environment variables (all required)
// Requires: GOVERNS_API_KEY, GOVERNS_BASE_URL, GOVERNS_ORG_ID
const client = createClientFromEnv();

// Or create client with explicit configuration (both URLs required)
const client = new GovernsAIClient({
  apiKey: "your-api-key",
  baseUrl: "https://your-platform-url", // platform APIs
  precheckBaseUrl: "https://your-precheck-url", // precheck-only APIs
  orgId: "org-456", // Organization context (static)
});

// Test connection
const isConnected = await client.testConnection();
console.log("Connected:", isConnected);

// Precheck a request
const precheckResponse = await client.precheck(
  {
    tool: "model.chat",
    scope: "net.external",
    raw_text: "Hello, how are you?",
    payload: { messages: [{ role: "user", content: "Hello" }] },
    tags: ["demo", "chat"],
  },
);

if (precheckResponse.decision === "deny") {
  console.log("Request blocked:", precheckResponse.reasons);
} else if (precheckResponse.decision === "confirm") {
  console.log("Confirmation required");
  // Handle confirmation flow...
} else {
  console.log("Request allowed");
  // Proceed with AI call...
}
```

## Configuration

### Environment Variables

```bash
# Required
GOVERNS_API_KEY=your-api-key
GOVERNS_BASE_URL=https://your-platform-url
GOVERNS_PRECHECK_BASE_URL=https://your-precheck-url
GOVERNS_ORG_ID=org-456

# Optional
GOVERNS_TIMEOUT=30000
GOVERNS_RETRIES=3
GOVERNS_RETRY_DELAY=1000
```

### Programmatic Configuration

```typescript
const client = new GovernsAIClient({
  apiKey: "your-api-key",
  baseUrl: "https://your-platform-url",
  orgId: "org-456",
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
});
```

## Core Features

### Precheck Integration

Validate requests before AI operations:

```typescript
// Check a chat message
const precheckResponse = await client.precheck({
  tool: 'model.chat',
  scope: 'net.external',
  raw_text: 'Hello, how are you?',
  payload: { messages: [{ role: 'user', content: 'Hello' }] },
  tags: ['demo', 'chat'],
}, 'user-123');

// Check a tool call (via PrecheckClient)
const toolPrecheck = await client.precheckClient.checkToolCall(
  'weather_current',
  { latitude: 52.52, longitude: 13.41, location_name: 'Berlin' },
  'net.external',
  undefined
);

// Handle different decisions
switch (precheckResponse.decision) {
  case 'allow':
    // Proceed with AI call
    break;
  case 'deny':
  case 'block':
    // Block the request
    console.log('Request blocked:', precheckResponse.reasons);
    break;
  case 'confirm':
    // Require user confirmation
    const confirmation = await client.confirm(
      'correlation-id',
      'chat',
      'Chat request',
      { messages: [...] },
      precheckResponse.reasons
    );
    break;
  case 'redact':
    // Use redacted content
    const redactedContent = precheckResponse.content;
    break;
}
```

### Confirmation Workflows

Handle user approval for sensitive operations:

```typescript
// Create confirmation request
const confirmation = await client.confirm(
  "correlation-id",
  "tool_call",
  "Execute payment tool",
  { tool: "payment_process", args: { amount: 99.99 } },
  ["High risk operation"]
);

// Poll for approval
await client.pollConfirmation(
  confirmation.confirmation.correlationId,
  (status) => {
    console.log("Confirmation status:", status);
  }
);

// Wait for approval
const approvedConfirmation = await client.confirmationClient.waitForApproval(
  confirmation.confirmation.correlationId,
  {
    interval: 2000,
    timeout: 300000,
    onStatusChange: (status) => console.log("Status:", status),
  }
);
```

### Budget Management

Track and manage AI usage costs:

```typescript
// Get budget context (identity derived from auth)
const budgetContext = await client.getBudgetContext();
console.log("Remaining budget:", budgetContext.remaining_budget);

// Check if budget allows a cost
const budgetStatus = await client.budgetClient.checkBudget(50.0);
if (!budgetStatus.allowed) {
  console.log("Insufficient budget:", budgetStatus.reason);
}

// Record usage after AI call (v1 payload)
await client.recordUsage({
  toolId: "chat",
  model: "gpt-4",
  tokensIn: 100,
  tokensOut: 50,
  cost: 0.15,
  metadata: { correlationId: "corr-123" },
});

// Get spend analytics
const spendData = await client.analyticsClient.getSpendAnalytics("30d");
console.log("Total spend:", spendData.spend.totalSpend);
console.log("Monthly spend:", spendData.spend.monthlySpend);
console.log("Over budget:", spendData.spend.isOverBudget);
```

### Tool Management

Register and manage tools:

```typescript
// Register tools
const tools = [
  {
    type: "function",
    function: {
      name: "weather_current",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          latitude: { type: "number", description: "Latitude coordinate" },
          longitude: { type: "number", description: "Longitude coordinate" },
        },
        required: ["latitude", "longitude"],
      },
    },
  },
];

await client.toolsClient.registerTools(tools);

// Execute tool with governance checks
const toolResult = await client.toolsClient.executeTool("weather_current", {
  latitude: 52.52,
  longitude: 13.41,
});

// Get tool metadata
const metadata = await client.toolsClient.getToolMetadata("weather_current");
console.log("Risk level:", metadata.metadata.risk_level);
```

### Analytics

Get comprehensive analytics and reporting:

```typescript
// Get decision analytics
const decisions = await client.analyticsClient.getDecisions({
  timeRange: "30d",
  includeStats: true,
});

console.log("Total decisions:", decisions.stats.total);
console.log("By decision:", decisions.stats.byDecision);

// Get spend analytics
const spendData = await client.analyticsClient.getSpendAnalytics("30d");
console.log("Spend breakdown:", {
  total: spendData.spend.totalSpend,
  monthly: spendData.spend.monthlySpend,
  byTool: spendData.spend.toolSpend,
  byModel: spendData.spend.modelSpend,
});

// Get usage records
const usageRecords = await client.analyticsClient.getUsageRecords({
  startDate: "2024-01-01",
  endDate: "2024-01-31",
  limit: 100,
});

// Get comprehensive dashboard data
const dashboardData = await client.analyticsClient.getDashboardData(
  "org-slug",
  "30d"
);
```

### Context Memory

```typescript
// Search context
const results = await client.searchContext({
  query: 'project spec',
  scope: 'user',
  limit: 20,
});

// Get recent conversation context
const contexts = await client.getRecentContext({
  userId: 'user-123',
  limit: 20,
  scope: 'user',
});

// Store context
const saved = await client.context.storeContext({
  content: 'Discussion summary...',
  contentType: 'user_message',
  agentId: 'agent-1',
  visibility: 'private',
});
```

### Policies

```typescript
const { policies } = await client.getPolicies();
```

## Error Handling

The SDK provides comprehensive error handling with retry logic:

```typescript
import { GovernsAIError, PrecheckError, BudgetError } from "@governs-ai/sdk";

try {
  const response = await client.precheck(request, 'user-123');
} catch (error) {
  if (error instanceof PrecheckError) {
    console.error("Precheck failed:", error.message);
  } else if (error instanceof BudgetError) {
    console.error("Budget error:", error.message);
  } else if (error instanceof GovernsAIError) {
    console.error("SDK error": error.message);
  }
}
```

## Advanced Usage

### Custom Retry Configuration

```typescript
// Configure retry behavior
client.updateConfig({
  retries: 5,
  retryDelay: 2000,
});

// Use with custom retry logic
await client.withRetry(async () => {
  return await client.precheck(request);
}, "custom operation");
```

### Batch Operations

```typescript
// Batch precheck multiple requests
const requests = [
  { tool: "model.chat", scope: "net.external", raw_text: "Hello" },
  { tool: "weather_current", scope: "net.external", raw_text: "Weather" },
];

const results = await client.precheckClient.checkBatch(requests);

// Batch tool execution
const toolCalls = [
  { tool: "weather_current", args: { latitude: 52.52, longitude: 13.41 } },
  { tool: "payment_process", args: { amount: 99.99 } },
];

const toolResults = await client.toolsClient.executeBatchTools(toolCalls);
```

### Health Monitoring

```typescript
// Check service health
const healthStatus = await client.getHealthStatus();
console.log("Platform status:", healthStatus.status);
console.log("Services:", healthStatus.services);

// Test individual services
const precheckStatus = await client.precheckClient.getServiceStatus();
const budgetStatus = await client.budgetClient.getServiceStatus();
```

## Examples

See the `examples/` directory for complete usage examples:

- `basic-usage.ts` - Basic SDK functionality
- `chat-integration.ts` - Chat application integration
- `tool-calling.ts` - Tool calling with governance
- `dashboard-analytics.ts` - Analytics and reporting

## API Reference

### GovernsAIClient

Main client class that orchestrates all SDK functionality.

#### Methods (selected)

- `precheck(request: PrecheckRequest, userId: string): Promise<PrecheckResponse>`
- `getBudgetContext(userId: string): Promise<BudgetContext>`
- `recordUsage(usage: UsageRecord): Promise<void>`
- `confirm(...): Promise<ConfirmationResponse>`
- `getConfirmationStatus(correlationId: string): Promise<ConfirmationStatus>`
- `pollConfirmation(...): Promise<void>`
- `testConnection(): Promise<boolean>`
- `getHealthStatus(): Promise<HealthStatus>`

### Feature Clients

- **PrecheckClient** (client.precheckClient): Request validation and governance compliance
- **ConfirmationClient** (client.confirmationClient): User approval workflows
- **BudgetClient** (client.budgetClient): Budget management and usage tracking
- **ToolClient** (client.toolsClient): Tool registration and execution
- **AnalyticsClient** (client.analyticsClient): Analytics and reporting

## TypeScript Support

The SDK provides comprehensive TypeScript definitions for all types, interfaces, and methods. All API responses and request parameters are fully typed.

```typescript
import {
  PrecheckRequest,
  PrecheckResponse,
  BudgetContext,
  UsageRecord,
  Decision,
  Tool,
  Message,
} from "@governs-ai/sdk";
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

**MIT License** - This SDK is fully open source with no restrictions.

You can:
- ✅ Use commercially without attribution
- ✅ Modify and redistribute
- ✅ Integrate into proprietary software
- ✅ Bundle with any project

See [LICENSE](LICENSE) file for details.

## Part of GovernsAI Open-Core

This SDK is part of the GovernsAI open-core ecosystem:
- **TypeScript SDK** (this package) - MIT
- **Precheck Service** - MIT
- **Browser Extension** - MIT
- **Platform Console** - ELv2 (source-available)

Learn more: [GovernsAI Licensing](https://docs.governsai.com/licensing)

## Support

For support and questions:

- GitHub Issues: [Create an issue](https://github.com/governs-ai/typescript-sdk/issues)
- Documentation: [SDK Documentation](https://docs.governsai.com/sdk)
- Community: [GitHub Discussions](https://github.com/governs-ai/typescript-sdk/discussions)
