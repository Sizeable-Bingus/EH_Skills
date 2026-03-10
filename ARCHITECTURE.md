# Architecture

## Repo Structure

- `src/server.tsx`: Bun entrypoint and Hono route registration
- `src/pages/`: TSX layouts and page components for summary, findings, chains, and loot
- `src/client/`: browser TypeScript for pipeline controls, findings expansion, and summary charts
- `src/db/`: `bun:sqlite` query shaping plus shared SQLite schema/ingestion logic
- `src/pipeline/`: in-process pipeline manager, Burp adapter, Claude adapter, real pipeline, and synthetic pipeline
- `src/assets/`: static styles copied into `dist/public/` by the Bun build
- `docs/`: durable product, architecture, and planning notes
- `engagements/`: on-disk scan artifacts and per-target SQLite databases
- `burp_headless_scanner/deep.json`: Burp scan configuration consumed by the real pipeline

`AGENTS.md` still references `scripts/` and `tests/e2e/`, but those directories do not exist in the current repo state.

## Runtime Components

### Bun/Hono web app

`src/server.tsx` defines the Hono application and serves:

- HTML pages for summary, findings, chains, and loot
- JSON endpoints for pipeline start/status and engagement listing/deletion
- an SSE endpoint for streaming pipeline log output
- static assets from `dist/public/`

The server keeps the existing multi-page route shape and adds the same security headers at the middleware layer.

### Server-rendered pages

`src/pages/layout.tsx` provides the shared navigation, scan modal, delete modal, and pipeline status bar. Individual page modules render the same product views as the prior Jinja templates, using the shared page models from the SQLite query layer.

### Client bundle

`src/build.ts` uses Bun's bundler to emit:

- `dist/public/pipeline.js`
- `dist/public/findings.js`
- `dist/public/executive_summary.js`
- `dist/public/styles.css`

Chart rendering now uses the bundled `chart.js` npm dependency instead of a CDN script.

### Query layer

`src/db/dashboard.ts` is a read-mostly SQLite adapter around `pentest_data.db`. It:

- resolves the latest engagement ID
- builds page-specific view models
- normalizes JSON fields stored as SQLite text
- preserves the existing severity ordering in SQL

### SQLite ingestion

`src/db/ingest.ts` owns the shared SQLite schema and writes exploitation output into `pentest_data.db`. Both the synthetic pipeline and the real TypeScript pipeline use this module so the app no longer depends on Python for DB persistence.

### Pipeline manager

`src/pipeline/manager.ts` is a single-process coordinator. It:

- enforces one active run at a time
- chooses real or synthetic mode from `PENTEST_PIPELINE_MODE`
- stores live state in memory
- captures log lines and phase changes
- replays history to new SSE subscribers

### Real pipeline

`src/pipeline/real.ts` orchestrates the authorized pentest flow:

1. start the Burp phase header
2. kill stale Burp, launch Burp headless, and wait for REST/MCP readiness
3. create and poll a Burp scan
4. save `burp_scan.json`
5. run Claude Code SDK recon, verification, and exploitation phases
6. ingest `exploitation_output.json` into SQLite
7. terminate Burp in `finally`

`src/pipeline/claude.ts` uses `@anthropic-ai/claude-agent-sdk` with project settings and the existing `.claude/` skills model. `src/pipeline/burp.ts` uses `fetch` and `Bun.spawn`.

### Synthetic pipeline

`src/pipeline/synthetic.ts` produces deterministic recon/exploitation artifacts and ingests them into SQLite without invoking Burp or Claude.

## Data Model And Storage

Each engagement remains stored under:

- `engagements/<sanitized-target>/`

Important files remain:

- `pentest_data.db`
- `burp_scan.json`
- `recon_output.json`
- `exploitation_output.json`

The app still treats an engagement directory as selectable when `pentest_data.db` exists.

## Request And Data Flow

### Page requests

1. Browser requests a page route.
2. `src/server.tsx` resolves the engagement database path.
3. `src/db/dashboard.ts` loads and shapes the page model.
4. Hono renders the TSX response.

### Starting a scan

1. Browser posts target and optional credentials to `/api/pipeline/start`.
2. Hono calls `pipelineManager.startPipeline(...)`.
3. The in-process runner executes the selected real or synthetic TypeScript pipeline.
4. Browser connects to `/api/pipeline/stream`.
5. SSE messages stream log lines until completion.
6. Browser refreshes the engagement list when the run ends.

### Deleting an engagement

1. Browser calls `DELETE /api/engagements/{name}`.
2. Hono verifies the engagement exists and is not actively being scanned.
3. The app removes the whole engagement directory with `rmSync(..., { recursive: true })`.

## Configuration

Current environment variables used by the code:

- `PORT`: HTTP port for the Bun server
- `PENTEST_PIPELINE_MODE`: selects `real` or `synthetic`
- `PENTEST_DASHBOARD_DB`: overrides the default SQLite path
- `PENTEST_DASHBOARD_ENGAGEMENT_ID`: fallback engagement ID when the DB is missing or empty
- `PENTEST_CLAUDE_MODEL`: optional Claude model override for the real pipeline
- `BURP_JAR`, `BURP_JAVA`, `BURP_REST_API`, `BURP_MCP_SSE`: Burp runtime overrides
- `PENTEST_SKIP_ASSET_BUILD`: skips the client bundle step on server startup

## Security And Operational Constraints

- Path traversal for engagement selection/deletion is reduced by normalizing names with `basename(...)`.
- Security headers are added at the Hono middleware layer.
- There is no authn/authz layer around dashboard or pipeline endpoints.
- Pipeline status is not persisted; an app restart resets in-memory status/subscriber state.
- The real pipeline still depends on local Burp Suite installation paths and a local Claude Code runtime.

## Known Gaps

- No automated end-to-end browser suite exists under `tests/e2e/` yet.
- No stable helper scripts exist under `scripts/` yet.
- Artifact/schema documentation still relies on code plus the exploitation skill references rather than a standalone schema document in `docs/`.
