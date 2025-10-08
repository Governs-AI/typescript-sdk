# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0-alpha.1] - 2024-01-XX

### Added

- Initial release of GovernsAI TypeScript SDK
- Core GovernsAIClient with configuration management
- PrecheckClient for request validation and governance compliance
- ConfirmationClient for WebAuthn-based approval workflows
- BudgetClient for usage tracking and limit enforcement
- ToolClient for tool registration and execution
- AnalyticsClient for dashboard data and usage insights
- Comprehensive TypeScript definitions
- Error handling with retry logic and exponential backoff
- Environment-based configuration
- Usage examples and documentation
- Jest testing framework setup

### Features

- Multi-user support with dynamic userId and static orgId
- Robust error handling with custom error classes
- Retry logic with exponential backoff and jitter
- Type-safe API interactions
- Modular client architecture
- Comprehensive logging and debugging

### Breaking Changes

- None (initial release)

### Dependencies

- TypeScript >= 4.5.0
- Node.js >= 16.0.0
- uuid ^9.0.0
