# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-alpha.17] — unpublished (v2 branch)

### Added

- `ConfirmationClient.consumeConfirmation(correlationId)` claims an approved
  confirmation for exactly one execution (`POST /api/v1/confirmation/:id/consume`).
- The `cancelled` and `consumed` confirmation statuses. Both are final.
- `sendPolicyConfig` config option.
- `ConfirmationResponse.confirmationUrl` / `approvalsUrl` (returned by the platform).

### Changed

- **Policy enrichment is off by default.** Precheck resolves the org's
  dashboard policy from the API key, and a payload `policy_config` is ignored
  whenever the org has one. Fetching `/api/v1/policies` before every precheck
  only added latency, and its 60s cache could send a stale policy.
  Set `sendPolicyConfig: true` for the old behaviour (orgs without a dashboard policy).
- `registerToolsWithMetadata`, `registerAgentTools` and `getAgentTools` use
  `/api/v1/tools`. The `/api/agents/*` routes they called don't exist. Tools
  already in the catalog are not overwritten.
- `approveConfirmation` is documented as session-only. The platform refuses
  API keys so an agent cannot approve its own request.


### Added

- `PrecheckClient` now supports configurable batch concurrency via `precheckBatchConcurrency` and `checkBatch(..., { concurrency })`.
- Added configurable enrichment controls:
  - `enrichmentCacheTtlMs`
  - `enrichmentCircuitFailureThreshold`
  - `enrichmentCircuitResetTimeoutMs`

### Changed

- `checkBatch` now uses `Promise.allSettled()` with bounded parallelism instead of serial processing.
- `GovernsAIClient.updateConfig` no longer bypasses TypeScript privacy with bracket notation and `any` casts.
- SDK enrichment now caches policy/tool/budget lookups (default TTL: 60s).
- SDK enrichment now uses a circuit breaker to fail fast when platform enrichment endpoints are degraded.

## [1.0.0-alpha.14] - 2026-02-28

### Added

- Context memory client and document management client APIs.
- External user memory helper workflows.
- Document OCR + vector search support in SDK client surface.

### Changed

- Precheck response normalization now canonicalizes legacy blocking decisions to `deny`.
- API route alignment updates for v1 endpoints and health checks.

## [1.0.0-alpha.1] - 2024-01-15

### Added

- Initial alpha release of the GovernsAI TypeScript SDK.
- Core `GovernsAIClient` with `precheck`, `confirmation`, `budget`, `tools`, and `analytics` clients.
- Typed request/response models and shared HTTP utility layer.
- Retry-aware error handling and SDK-level diagnostics.
