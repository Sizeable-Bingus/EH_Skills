# 100% Bun Coverage Plus Phase-2 Playwright Smoke Suite

## Summary

- Phase 1: achieve and enforce 100% line and function coverage for executable `src/**/*.ts` and `src/**/*.tsx` using Bun tests and `lcov` gating.
- Phase 2: add a small Playwright smoke suite for the documented browser-critical flows. Treat it as confidence coverage, not part of the 100% metric.
- Exclude non-executable artifacts from the Bun coverage gate: `src/assets/styles.css`, `src/types.ts`, and `src/pipeline/types.ts`.

## Phase 1: Bun Coverage

- Add strict coverage scripts:
  - `test:coverage`: run `bun test --coverage --coverage-reporter=lcov --coverage-reporter=text`
  - `coverage:check`: parse `coverage/lcov.info`, enumerate executable `src/` TS/TSX files, fail if any included file is absent or below 100% lines/functions
  - make the coverage gate part of the standard validation workflow
- Keep Bun as the only unit/integration coverage tool. Do not use Playwright for coverage enforcement.

- Refactor client entrypoints for testability while preserving browser auto-init:
  - `src/client/pipeline.ts` exports `initializePipelineUi`
  - `src/client/dashboard.ts` exports `initializeDashboardPage`
  - `src/client/executive_summary.ts` exports `initializeExecutiveSummaryPage`
  - `src/client/findings.ts` exports `initializeFindingsPage`
  - keep a thin `if (typeof document !== "undefined")` auto-bootstrap wrapper in each file
- Inject dependencies where needed instead of relying on globals:
  - DOM/document/window
  - `fetch`
  - `EventSource`
  - timers
  - `alert`
  - chart constructor for chart pages
- Add a shared Bun test helper that provides a minimal DOM shim and stubs for navigation, timers, fetch, EventSource, and Chart.

- Add explicit seams for currently hard-to-cover runtime logic:
  - `src/pipeline/real.ts`: introduce a `RealPipelineDependencies` object covering Burp execution, Claude phases, JSON file read, path existence check, and SQLite ingestion
  - `src/pipeline/burp.ts`: route all sleeps through injected dependencies, including stale-process shutdown delay
  - `src/build.ts`: inject build/write operations so success and failure paths are testable
- Move `import.meta.main` wrappers out of `src/` and into `scripts/` entrypoints so `src/` stays pure and fully coverable:
  - one server entrypoint script
  - one asset-build entrypoint script
  - update package scripts and docs to call those wrappers

## Bun Test Expansion

- Utilities/constants:
  - env-driven defaults and overrides in `src/constants.ts`
  - `databaseExists`, `sanitizeTarget`, `safeEngagementName`, `parseJson`, `jsonStringify`, `phaseHeader`, `getErrorMessage`
- DB/query layer:
  - missing DB fallback
  - engagement resolution with and without explicit name
  - `UnknownEngagementError`
  - scope normalization for object, legacy fields, and empty scope
  - findings filters for severity, category, and both together
  - finding field fallback from `http_method` to `method`
  - loot detail/evidence fallback branches
  - dashboard aggregation, empty state, and zero-findings row branches
- SQLite/ingest:
  - top-level validation errors
  - finding validation errors
  - confirmed-only vs `includeAll`
  - duplicate engagement rejection vs `force`
  - rollback on downstream insert failure
  - schema upgrade branch in `ensureColumn`
  - missing DB read-only failure path
- Server/pipeline:
  - security headers on HTML, JSON, SSE, and static responses
  - pipeline start success, missing target, and conflict
  - status endpoint for idle/running/complete/error
  - SSE line streaming, done-event payload, and unsubscribe cleanup
  - delete success, blocked-running, unknown engagement, and sanitized-name behavior
  - manager error transitions, replay behavior, unsubscribe behavior, and stale-subscriber reset
  - Burp timeout/failure/missing-header/failed-scan warning/cleanup branches
  - Claude non-text filtering and error logging
  - real pipeline success, missing artifact, ingestion warning, Claude failure, credentials/no-credentials prompt composition, and Burp shutdown in every exit path
- Page rendering:
  - summary conditional branches for duration, tools, string scope, structured scope, out-of-scope, and rules-of-engagement
  - dashboard empty state and severity badge branches
- Client modules:
  - findings toggle behavior and no-op guards
  - chart init success and invalid JSON fallback
  - dashboard row navigation
  - pipeline modal open/cancel/start/error
  - log panel toggle and auto-hide behavior
  - engagement combobox filtering, focus, keyboard navigation, blur reset, and selection
  - delete modal open/cancel/confirm/error
  - bootstrap fetch failures for engagements and status treated as non-fatal

## Phase 2: Playwright Smoke Suite

- Add Playwright as a separate E2E layer under `tests/e2e/`.
- Use the app in synthetic mode only:
  - `PENTEST_PIPELINE_MODE=synthetic`
  - serve against a temporary engagements fixture directory
  - start from the dedicated server entrypoint script created in Phase 1
  - build assets once before E2E, then reuse them during the suite
- Keep the suite intentionally small and stable. Cover only the documented user-critical flows:
  - dashboard loads and shows latest engagement
  - engagement switcher navigates to another engagement
  - start scan opens modal, submits target, shows running status/log stream, and finishes
  - delete engagement removes a selected engagement and returns to the dashboard
- Stub nothing at the browser layer except test-owned data/setup. The goal is to exercise the real Bun server, rendered pages, client JS, and SSE flow together.
- Do not gate merges on browser coverage metrics. Gate on Playwright pass/fail only.
- Add scripts such as:
  - `test:e2e`
  - `test:smoke`
- Document that Playwright is phase 2 confidence coverage and does not replace the Bun coverage gate.

## Public Interfaces and Types

- New exported client init functions from each browser entrypoint.
- New `RealPipelineDependencies` type for testable orchestration.
- Optional dependency-injection options for `buildClientAssets`.
- No changes to user-facing HTTP API shapes or product behavior.

## Assumptions

- The 100% target applies only to executable TypeScript/TSX under `src/`.
- CSS and type-only modules are outside the metric.
- Synthetic mode is sufficient for all Playwright smoke flows.
- A small amount of refactoring for testability is acceptable if runtime behavior remains unchanged.
