// SPDX-License-Identifier: MIT
// Copyright (c) 2024 GovernsAI. All rights reserved.
/**
 * GovernsAI TypeScript SDK
 * Main entry point for the SDK
 */

// Core client
export { GovernsAIClient, createClient, createClientFromEnv } from './client';

// Middleware helpers (import direct via subpaths for tree-shaking).
export { callPrecheck, PrecheckHTTPError } from './middleware/precheck-fetch';
export type { PrecheckResult, PrecheckCallOptions, PrecheckDecisionKind } from './middleware/precheck-fetch';
export { governsExpress } from './middleware/express';
export type { GovernsExpressOptions } from './middleware/express';
export { governsNextMiddleware } from './middleware/nextjs';
export type { GovernsNextOptions } from './middleware/nextjs';

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
