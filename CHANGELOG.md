# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
