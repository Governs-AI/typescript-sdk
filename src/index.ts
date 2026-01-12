/**
 * GovernsAI TypeScript SDK
 * Main entry point for the SDK
 */

// Core client
export { GovernsAIClient, createClient, createClientFromEnv } from './client';

// Feature clients
export { PrecheckClient } from './precheck';
export { ConfirmationClient } from './confirmation';
export { BudgetClient } from './budget';
export { ToolClient } from './tools';
export { AnalyticsClient } from './analytics';
export { ContextClient } from './memory';
export { DocumentClient } from './documents';

// Types
export * from './types';

// Errors
export * from './errors';

// Utilities
export { HTTPClient, defaultLogger, Logger, ConsoleLogger } from './utils';

// Default export
export { default } from './client';
