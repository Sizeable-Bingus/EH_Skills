# TypeScript/Bun Migration Plan

## Summary

Port the repository to a Bun-first TypeScript stack in one cutover, while keeping the current server-rendered multi-page product shape and the current on-disk artifact contracts. Use `Hono` on Bun for HTTP routing, TSX for server-rendered pages, `bun:sqlite` for SQLite access, Bun's build/runtime for browser TypeScript, and Anthropic's TypeScript Claude Code SDK for the real pipeline phases.

## Implementation Changes

- Replace the Python dashboard app with a Bun/Hono app under `src/`:
  - `src/server.tsx` boots the Bun server and Hono app.
  - `src/pages/` contains TSX layouts and page components for summary, findings, chains, and loot.
  - `src/client/` contains browser TypeScript modules for pipeline UI, findings expanders, and charts.
  - `src/db/` contains direct SQL query modules and shared row-to-view-model shaping.
  - `src/pipeline/` contains the in-process pipeline manager, Burp client/process control, synthetic pipeline, real pipeline, and shared artifact writers.
- Keep the current user-facing route set unchanged:
  - `GET /`, `/findings`, `/chains`, `/loot`
  - `POST /api/pipeline/start`
  - `GET /api/pipeline/status`
  - `GET /api/pipeline/stream`
  - `GET /api/engagements`
  - `DELETE /api/engagements/:name`
- Preserve the current storage contracts:
  - Engagement directories remain `engagements/<sanitized-target>/`
  - Artifacts remain `pentest_data.db`, `burp_scan.json`, `recon_output.json`, and `exploitation_output.json`
  - The SQLite schema remains compatible with the current dashboard data expectations
- Replace Python query/ingest logic with shared TypeScript modules:
  - Port `dashboard/db.py` queries to typed `bun:sqlite` statements
  - Port the synthetic pipeline's SQLite write path into TypeScript so both real and synthetic modes use the same TS ingestion module
  - Keep JSON normalization and severity ordering behavior intact unless there is a deliberate cleanup with matching tests
- Rebuild the pipeline runtime in TypeScript:
  - Keep one-run-at-a-time, in-memory pipeline state and SSE log streaming
  - Use `Bun.spawn` for Burp launch/termination and any OS-level process calls
  - Recreate Burp polling and artifact persistence with `fetch`, timers, and Bun file APIs
  - Recreate recon and exploitation phases with `@anthropic-ai/claude-code` and the same project skill/settings model
  - Keep `.claude/skills/*` as operational inputs; do not rewrite skill content into app code in v1
- Convert frontend JS to typed browser modules:
  - `pipeline.js`, `findings.js`, and `executive_summary.js` become `.ts`
  - Replace CDN Chart.js usage with a bundled npm dependency so client assets are built locally by Bun
  - Keep the current MPA navigation and progressive-enhancement behavior; no SPA state layer
- Standardize tooling around Bun + TypeScript:
  - Add `package.json`, `tsconfig.json`, `eslint.config.*`, `.prettierrc.*`, and Bun scripts for `dev`, `build`, `start`, `lint`, `format`, `typecheck`, and `test`
  - Use ESLint flat config with `@typescript-eslint`; let Prettier own formatting and disable ESLint formatting rules
  - Remove Python runtime/package files once the TS app is fully wired and verified
- Update durable docs in the same change:
  - Update `PRODUCT.md` only where behavior or operational commands changed
  - Update `ARCHITECTURE.md` to describe Bun/Hono/TSX/SQLite/Claude Code TS SDK
  - Add a migration plan note in `docs/plans/` describing the final TypeScript architecture and cutover decisions
  - Update `AGENTS.md` done-check commands from `uv run pyright` / `uv run ruff check` to the Bun equivalents

## Public APIs, Interfaces, and Types

- Define shared TS types for:
  - `StartPipelineRequest`
  - `PipelineStatus` and `PipelineState`
  - `EngagementSummaryViewModel`, `FindingsPageModel`, `ChainsPageModel`, and `LootPageModel`
  - `ReconOutput` and `ExploitationOutput` matching current artifact contracts
- Keep HTTP request/response shapes compatible with the current UI unless a route cleanup is explicitly paired with template/client updates in the same change.
- Keep `sanitizeTarget()` behavior stable so engagement directory naming does not change across the migration.

## Test Plan

- Add Bun unit/integration tests for:
  - route responses for all four HTML pages
  - engagement resolution and deletion guardrails
  - SQLite query shaping for summary/findings/chains/loot against fixture DBs
  - pipeline manager state transitions and one-run-at-a-time enforcement
  - SSE stream behavior, including completion/error events
  - synthetic artifact generation and SQLite ingestion
  - Burp client polling and failure handling with mocked HTTP/process boundaries
  - Claude phase adapter behavior with mocked SDK message streams
- Add browser-level checks for the critical workflows:
  - load latest engagement when no query param is present
  - switch engagement from the combobox
  - start a synthetic scan and observe status/log streaming
  - delete an engagement and verify the running-engagement guard
- Acceptance criteria:
  - all existing user workflows still work from the browser
  - real and synthetic pipelines both produce the expected artifact files
  - no Python runtime is required to run the app after cutover
  - `bun x tsc --noEmit`, `bun x eslint .`, `bun x prettier --check .`, and the test suite pass

## Assumptions And Defaults

- Default server framework: `Hono` on Bun.
- Default rendering model: TSX server rendering via Hono JSX renderer.
- Default DB access strategy: direct SQL with `bun:sqlite`; no ORM/query builder in v1.
- Default migration boundary: full repo ends in TypeScript, but implementation can proceed subsystem-by-subsystem behind a long-lived branch before the final cutover.
- Anthropic integration note: the TypeScript Claude Code SDK is the chosen integration, but per Anthropic's docs it still runs Claude Code via the packaged executable/subprocess model; this removes Python orchestration, not the Claude Code runtime dependency.
- External process dependencies remain where the product requires them, especially Burp Suite.

## References

- [Bun TypeScript docs](https://bun.sh/docs/typescript)
- [Bun server docs](https://bun.sh/docs/api/http)
- [Bun SQLite docs](https://bun.sh/docs/runtime/sqlite)
- [Hono Bun guide](https://hono.dev/docs/getting-started/bun)
- [Hono JSX docs](https://hono.dev/docs/guides/jsx)
- [Hono SSE streaming docs](https://hono.dev/docs/helpers/streaming)
- [Anthropic Claude Code SDK overview](https://docs.anthropic.com/en/docs/claude-code/sdk)
- [Anthropic Claude Code TypeScript SDK](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-typescript)
