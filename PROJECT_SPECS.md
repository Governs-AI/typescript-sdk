# PROJECT_SPECS.md

## Project Overview
- **Project Name**: GovernsAI TypeScript SDK
- **Version**: 1.0.0-alpha.14
- **Last Updated**: 2026-04-20 19:05 UTC
- **Primary Purpose**: TypeScript client library for integrating GovernsAI governance controls into application workflows, including precheck, confirmations, budgets, tools, analytics, memory, and documents.
- **Target Audience**: Application developers integrating GovernsAI into Node.js and TypeScript services.

## Current Project Status
- **Development Stage**: Alpha
- **Build Status**: Passing locally for `npm run lint` (warnings only), `npm run build`, and `npm test -- --ci --runInBand`; remote publish is blocked by npm OTP requirements and CI secret scanning is blocked by a missing `GITLEAKS_LICENSE` secret.
- **Test Coverage**: Coverage reporting is available via `npm run test:coverage`, but no tracked percentage is committed in the repo.
- **Known Issues**: `@governs-ai/sdk` on npm is still `1.0.0-alpha.12` because the configured `NPM_TOKEN` requires interactive OTP during `npm publish`; repository CI secret scanning also fails until `GITLEAKS_LICENSE` is configured. Source maps and declaration maps are published without `src/`, and `npm audit` currently reports devDependency vulnerabilities.
- **Next Milestone**: Replace the npm token with an automation-capable publish token, add `GITLEAKS_LICENSE`, rerun the `v1.0.0-alpha.14` publish, then update `chat-agent-example` to pin `@governs-ai/sdk@1.0.0-alpha.14`.

## Architecture Overview

### Tech Stack
- **Frontend**: None; this repository ships a TypeScript SDK package rather than a UI.
- **Backend**: None in-repo; the SDK targets GovernsAI platform REST APIs.
- **Database**: None in-repo.
- **Infrastructure**: GitHub Actions for CI (`ci.yml`, `labeler.yml`) and npm publish (`publish.yml`), npm registry for package distribution, GitHub for source control and release tags.
- **Development Tools**: TypeScript 5.x, Jest 29.x with `ts-jest`, ESLint 8.x, npm, Node.js 16+ for consumers and Node.js 20 in CI.

### System Architecture
- **Architecture Pattern**: Modular client SDK with a central orchestrator (`GovernsAIClient`) and feature-specific service clients.
- **Key Components**: `client.ts`, `precheck.ts`, `confirmation.ts`, `budget.ts`, `tools.ts`, `analytics.ts`, `memory.ts`, `documents.ts`, `utils.ts`, `errors.ts`, and shared `types.ts`.
- **Data Flow**: Consumer code initializes `GovernsAIClient` with API credentials and endpoint configuration; the client delegates requests to feature clients; `HTTPClient` applies headers, timeout, and retry behavior; JSON responses are normalized into typed SDK models and surfaced back to the caller.
- **External Dependencies**: GovernsAI platform APIs under `/api/v1/*`, npm registry, GitHub Actions secrets (`NPM_TOKEN`), and the runtime dependency `uuid`.

### Directory Structure
```text
typescript-sdk/
├── .github/workflows/        # CI, publish, and labeler automation
├── src/
│   ├── __tests__/            # Jest unit/regression coverage
│   ├── examples/             # Usage examples for SDK consumers
│   ├── analytics.ts          # Analytics API client
│   ├── budget.ts             # Budget and usage APIs
│   ├── client.ts             # Main GovernsAIClient orchestration layer
│   ├── confirmation.ts       # Confirmation workflow APIs
│   ├── documents.ts          # OCR/document upload and search APIs
│   ├── errors.ts             # Error types and retry helpers
│   ├── index.ts              # Public exports
│   ├── memory.ts             # Context and external memory APIs
│   ├── precheck.ts           # Governance precheck APIs
│   ├── tools.ts              # Tool registry and execution APIs
│   ├── types.ts              # Shared request/response types
│   └── utils.ts              # HTTP client and utility helpers
├── CHANGELOG.md              # Release history
├── CONTRIBUTING.md           # Contribution guidance
├── LICENSE                   # MIT license
├── README.md                 # Public-facing package documentation
├── jest.config.js            # Jest/ts-jest configuration
├── package.json              # Package metadata and scripts
├── package-lock.json         # Locked npm dependency graph
├── PROJECT_SPECS.md          # Living project state document
└── tsconfig.json             # TypeScript compiler settings
```

## Core Features & Modules
- **Precheck Governance**: `src/precheck.ts` validates requests, batches checks, normalizes decisions, and enriches results with platform metadata. Status: active.
- **Confirmation Workflows**: `src/confirmation.ts` creates and polls approval flows for risky actions. Status: active.
- **Budget Management**: `src/budget.ts` reads budget context, records usage, and manages spend limits. Status: active.
- **Tool Governance**: `src/tools.ts` registers tools, fetches metadata, and executes tool flows with governance controls. Status: active.
- **Analytics Access**: `src/analytics.ts` exposes decision, spend, and dashboard reporting APIs. Status: active.
- **Context Memory**: `src/memory.ts` supports context storage, search, summaries, and external user memory mapping. Status: active.
- **Document Management**: `src/documents.ts` supports document upload, OCR/RAG workflows, listing, search, and deletion. Status: active.
- **Shared Runtime Utilities**: `src/utils.ts`, `src/errors.ts`, and `src/types.ts` provide transport, retry, typing, and error semantics used across the SDK. Status: active.

## API Documentation
- **Base URL**: Configurable via `baseUrl`; `precheckBaseUrl` can optionally override precheck-specific traffic.
- **Authentication**: API key sent as `X-Governs-Key`; organization context provided through `orgId` in SDK config.
- **Key Endpoints**: `/api/v1/precheck`, `/api/v1/confirmation/create`, `/api/v1/budget/context`, `/api/v1/usage`, `/api/v1/tools`, `/api/v1/decisions`, `/api/v1/context`, `/api/v1/context/search`, `/api/v1/documents`, `/api/v1/documents/search`, `/api/v1/policies`, `/api/v1/profile`, `/api/v1/health`.
- **Data Models**: `GovernsAIConfig`, `PrecheckRequest`, `PrecheckResponse`, `BudgetContext`, `UsageRecord`, confirmation response/status models, memory payloads, and document upload/search models in `src/types.ts`.

## Database Schema
- **Tables/Collections**: Not applicable; this repository is a client SDK and does not define persistence schema.
- **Key Relationships**: Not applicable in-repo.
- **Indexes**: Not applicable in-repo.

## Development Workflow

### Setup Instructions
1. Install dependencies with `npm ci`.
2. Provide environment variables as needed: `GOVERNS_API_KEY`, `GOVERNS_BASE_URL`, `GOVERNS_PRECHECK_BASE_URL` (optional), `GOVERNS_ORG_ID`, `GOVERNS_TIMEOUT` (optional), `GOVERNS_RETRIES` (optional), and `GOVERNS_RETRY_DELAY` (optional).
3. No database setup is required for this repository.
4. Common local commands: `npm run build`, `npm test`, `npm run test:coverage`, `npm run lint`.

### Testing Strategy
- **Unit Tests**: Jest tests in `src/__tests__/`; run with `npm test`.
- **Integration Tests**: No separate integration test suite is currently defined in the repository.
- **E2E Tests**: No end-to-end test suite is currently defined in the repository.

### Deployment Process
- **Staging**: There is no separate staging deploy for the package; validation happens via local build/tests and GitHub Actions CI on `dev` and `feat/**`.
- **Production**: Publishing occurs through `.github/workflows/publish.yml` when a `v*` git tag is pushed; the workflow runs `npm ci`, `npm run build`, and `npm publish --provenance --access public`.
- **Rollback**: If a bad package is published, ship a follow-up version and use npm deprecation messaging if necessary; do not rely on deleting published package history.

## Configuration Management
- **Environment Variables**: `GOVERNS_API_KEY`, `GOVERNS_BASE_URL`, `GOVERNS_PRECHECK_BASE_URL`, `GOVERNS_ORG_ID`, `GOVERNS_TIMEOUT`, `GOVERNS_RETRIES`, `GOVERNS_RETRY_DELAY`.
- **Config Files**: `package.json` for scripts/package metadata, `tsconfig.json` for compile settings, `jest.config.js` for tests, `.github/workflows/*.yml` for CI/release automation.
- **Secrets Management**: npm publishing uses the GitHub repository secret `NPM_TOKEN`; secrets are not stored in the repository.

## Performance & Monitoring
- **Key Metrics**: Precheck latency, confirmation polling behavior, retry counts, budget endpoint error rates, document upload/search latency, and publish workflow success rate.
- **Performance Benchmarks**: No formal benchmark suite is committed in the repository.
- **Alerting**: Failures surface through GitHub Actions CI/publish workflow status and npm publish failures.

## Security Considerations
- **Authentication/Authorization**: Requests rely on an API key header plus organization-scoped configuration; auth failures surface as typed SDK errors.
- **Data Protection**: Secrets stay outside the repository, CI includes `gitleaks` secret scanning, and package publishing uses npm provenance.
- **Security Audits**: `npm audit` currently reports 11 vulnerabilities in dev dependencies; runtime dependency surface is minimal (`uuid`).

## Recent Changes Log
- **2026-04-20**: Fixed the ESLint config plus example/test helper error-level lint violations so local lint now passes with warnings only.
- **2026-04-20**: Fixed `retry.test.ts` TypeScript/Jest release blockers and aligned the changelog so `1.0.0-alpha.14` accurately reflects shipped functionality.
- **2026-04-20**: `1.0.0-alpha.14` release candidate includes context memory, document management, external user memory helpers, precheck batch concurrency, and enrichment cache/circuit-breaker controls.
- **2024-01-15**: Initial alpha release established the core client, governance clients, typed models, and retry-aware error handling.

## Team & Contacts
- **Project Lead**: Pixel (SDK & Developer Experience Lead)
- **Key Contributors**: Atlas (server API contract), Forge (CI), Quill (documentation), Lambda (demo app coordination)
- **Code Reviewers**: Nexus (code quality) and Cipher (security/architecture)

## Documentation Links
- **API Docs**: [SDK Documentation](https://docs.governsai.com/sdk)
- **User Manual**: [README.md](README.md)
- **Development Docs**: [CONTRIBUTING.md](CONTRIBUTING.md)
