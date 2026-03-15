# Architecture

## Repo Structure

- `src/server.tsx`: Bun entrypoint and Hono route registration
- `src/pages/`: TSX layouts and page components for dashboard, summary, findings, chains, and loot
- `src/client/`: browser TypeScript for pipeline controls, findings expansion, and summary charts
- `src/db/`: `bun:sqlite` query shaping plus shared SQLite schema/ingestion logic
- `src/pipeline/`: in-process pipeline manager, Burp adapter, Claude adapter, real pipeline, and synthetic pipeline
- `src/assets/`: static styles copied into `dist/public/` by the Bun build
- `scripts/`: stable helper commands, including the PR review loop watcher/resolver
- `tests/e2e/`: Playwright smoke coverage for the documented browser-critical flows
- `docs/`: durable product, architecture, and planning notes
- `engagements/`: on-disk scan artifacts and per-target SQLite databases
- `burp_headless_scanner/deep.json`: Burp scan configuration consumed by the real pipeline

## Runtime Components

### Bun/Hono web app

`src/server.tsx` defines the Hono application and serves:

- HTML pages for the cross-engagement dashboard, summary, findings, chains, and loot
- JSON endpoints for page data (summary, findings, chains, loot), pipeline start/status, and engagement listing/deletion
- an SSE endpoint for streaming pipeline log output
- static assets from `dist/public/`

The server keeps the existing multi-page route shape and adds the same security headers at the middleware layer.

### Authentication

`src/auth.ts` provides Azure AD (Entra ID) JWT authentication via the `jose` library. The `createAuthMiddleware` factory returns a Hono middleware that:

- Skips `/static/*` paths (public assets)
- Extracts and verifies Bearer tokens against Microsoft's JWKS endpoint
- Validates audience, issuer, and tenant (`tid`) claims
- Returns 401/403 JSON errors for invalid or unauthorized requests
- Can be disabled entirely with `AUTH_DISABLED=true` for local development

The middleware is injectable via `AppOptions.authMiddleware` for test isolation.

### Server-rendered pages

`src/pages/layout.tsx` provides the shared navigation, scan modal, delete modal, and pipeline status bar. Individual page modules render the same product views as the prior Jinja templates, using the shared page models from the SQLite query layer.

### Client bundle

`src/build.ts` uses Bun's bundler to emit:

- `dist/public/pipeline.js`
- `dist/public/findings.js`
- `dist/public/executive_summary.js`
- `dist/public/dashboard.js`
- `dist/public/styles.css`

Chart rendering now uses the bundled `chart.js` npm dependency instead of a CDN script.
The browser entrypoints in `src/client/*.ts` are thin auto-bootstrap wrappers over
testable implementation modules in the same folder.

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

### JSON API requests

The `/api/` prefix exposes page data in JSON form. The cross-engagement dashboard (`/`) has no corresponding JSON API endpoint; the remaining per-engagement pages are mirrored:

| Endpoint                        | Query Params                                      | Returns                                                             |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /api/summary`              | `engagement`                                      | Summary view model (engagement metadata, severity breakdown, scope) |
| `GET /api/findings`             | `engagement`, `severity`, `category`              | Findings list with optional severity/category filters               |
| `GET /api/chains`               | `engagement`                                      | Attack chains list                                                  |
| `GET /api/loot`                 | `engagement`                                      | Credentials and loot                                                |
| `GET /api/engagements`          | —                                                 | List of engagement names                                            |
| `DELETE /api/engagements/:name` | —                                                 | Deletes an engagement directory                                     |
| `POST /api/pipeline/start`      | — (JSON body: `target`, `username?`, `password?`) | Starts a pipeline run                                               |
| `GET /api/pipeline/status`      | —                                                 | Current pipeline state                                              |
| `GET /api/pipeline/stream`      | —                                                 | SSE stream of pipeline log lines                                    |

The `engagement` query parameter selects the target engagement; when omitted, the server resolves to the most recent one. Invalid engagement names return `404` with `{ "detail": "Unknown engagement: <name>" }`. Non-engagement errors on `/api/` routes return `500` with `{ "detail": "Internal Server Error" }`.

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
- `PENTEST_PIPELINE_MODE`: selects `real` or `synthetic`; other values fail fast
- `PENTEST_DASHBOARD_DB`: overrides the default SQLite path
- `PENTEST_DASHBOARD_ENGAGEMENT_ID`: fallback engagement ID when the DB is missing or empty
- `PENTEST_CLAUDE_MODEL`: optional Claude model override for the real pipeline
- `BURP_JAR`, `BURP_JAVA`, `BURP_REST_API`, `BURP_MCP_SSE`: Burp runtime overrides
- `PENTEST_ENGAGEMENTS_DIR`: overrides the default engagements directory (used by `scripts/start-server.ts` and Playwright config)
- `PENTEST_SKIP_ASSET_BUILD`: skips the client bundle step on server startup
- `AZURE_CLIENT_ID`: Azure AD app registration client ID (expected `aud` claim)
- `AZURE_TENANT_ID`: Azure AD tenant ID (for JWKS URL, issuer, and `tid` claim)
- `AUTH_DISABLED`: set to `"true"` to bypass authentication (local dev)

## Development Workflow

`scripts/build-assets.ts` is the stable asset-build entrypoint.
`scripts/start-server.ts` is the stable Bun server entrypoint.
`scripts/prepare-e2e-fixtures.ts` prepares the synthetic Playwright fixture data.
`scripts/coverage-check.ts` enforces the LCOV-based Bun coverage gate.

`scripts/pr-review-loop.sh` provides a stable GitHub review workflow for the
current PR. It can:

- print a one-shot JSON snapshot with `status`
- poll unresolved review threads on an interval with `watch`, resetting its
  timeout after each local commit
- resolve a known thread ID with `resolve`

## Security And Operational Constraints

- Path traversal for engagement selection/deletion is reduced by normalizing names with `basename(...)`.
- Security headers are added at the Hono middleware layer.
- Azure AD (Entra ID) JWT authentication protects all non-static routes. Auth can be disabled for local dev with `AUTH_DISABLED=true`.
- Pipeline status is not persisted; an app restart resets in-memory status/subscriber state.
- The real pipeline still depends on local Burp Suite installation paths and a local Claude Code runtime.

## Known Gaps

- Artifact/schema documentation still relies on code plus the exploitation skill references rather than a standalone schema document in `docs/`.
