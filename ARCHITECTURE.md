# Architecture

## Repo Structure

- `dashboard/`: FastAPI app, Jinja templates, static assets, SQLite query layer, and in-process pipeline manager
- `burp_headless_scanner/`: Burp configuration and helper script used by the real pipeline
- `pentest_pipeline/`: real and synthetic pipeline entrypoints
- `docs/`: durable product, architecture, and planning notes
- repository root: supporting project config and shared assets

`AGENTS.md` references `scripts/` and `tests/e2e/`, but those directories do not exist in the current repo state.

## Runtime Components

### Dashboard web app

`dashboard/app.py` defines the FastAPI application. It serves:

- HTML pages for summary, findings, chains, and loot
- JSON endpoints for pipeline start/status and engagement listing/deletion
- an SSE endpoint that streams pipeline log output to the browser

Templates live in `dashboard/templates/` and shared client behavior for scan control and engagement selection lives in `dashboard/static/pipeline.js`.

### Query layer

`dashboard/db.py` is a read-mostly SQLite adapter around `pentest_data.db`. It:

- resolves the latest engagement ID
- builds page-specific view models
- normalizes some JSON fields from SQLite text columns
- preserves the existing severity sort order in SQL

### Pipeline manager

`dashboard/pipeline.py` is a single-process async coordinator. It:

- enforces one active run at a time
- chooses `pentest_pipeline/pentest_pipeline.py` or `pentest_pipeline/pentest_pipeline_test.py` from `PENTEST_PIPELINE_MODE`
- spawns the pipeline with `uv run python3`
- captures stdout into in-memory log state
- extracts phase names from `PHASE:` log lines
- fans log lines out to SSE subscribers

Pipeline state is stored in a module-global `PipelineState` instance.

### Real pipeline

`pentest_pipeline/pentest_pipeline.py` orchestrates the authorized pentest flow:

1. kill any stale Burp process
2. launch Burp headless
3. wait for Burp REST and MCP endpoints
4. create and poll a Burp scan
5. save `burp_scan.json`
6. run Claude-agent-driven recon, verification, and exploitation phases
7. terminate Burp in `finally`

### Synthetic pipeline

`pentest_pipeline/pentest_pipeline_test.py` produces deterministic synthetic artifacts for development without running models. It writes JSON outputs and a SQLite database under the engagement directory.

## Data Model And Storage

Each engagement is stored on disk under:

- `engagements/<sanitized-target>/`

Important files:

- `pentest_data.db`: dashboard source of truth
- `burp_scan.json`: raw Burp scan output for real runs
- `recon_output.json`: recon artifact
- `exploitation_output.json`: flat exploitation artifact with `meta`,
  `findings`, `loot`, and `exploitation_chains`

The dashboard treats an engagement directory as selectable when `pentest_data.db` exists.

## Request And Data Flow

### Page requests

1. Browser requests a page route.
2. `dashboard/app.py` resolves the engagement database path.
3. `dashboard/db.py` loads and shapes the requested data.
4. Jinja renders the HTML response.

### Starting a scan

1. Browser posts target and optional credentials to `/api/pipeline/start`.
2. FastAPI calls `dashboard.pipeline.start_pipeline(...)`.
3. The pipeline manager spawns the configured pipeline script from `pentest_pipeline/`.
4. Browser connects to `/api/pipeline/stream`.
5. SSE messages stream stdout lines until completion.
6. Browser refreshes the engagement list when the run ends.

### Deleting an engagement

1. Browser calls `DELETE /api/engagements/{name}`.
2. FastAPI verifies the engagement exists and is not actively being scanned.
3. The app removes the whole engagement directory with `shutil.rmtree`.

## Configuration

Current environment variables used by the code:

- `PENTEST_PIPELINE_MODE`: selects `real` or `synthetic`
- `PENTEST_DASHBOARD_DB`: overrides the default SQLite path
- `PENTEST_DASHBOARD_ENGAGEMENT_ID`: fallback engagement ID when the DB is missing or empty
- `PENTEST_CRED_USERNAME`: passed into the pipeline when credentials are supplied
- `PENTEST_CRED_PASSWORD`: passed into the pipeline when credentials are supplied

## Security And Operational Constraints

- Path traversal for engagement selection/deletion is reduced by normalizing names with `Path(...).name`.
- Security headers are added at the FastAPI middleware layer.
- There is no authn/authz layer around dashboard or pipeline endpoints.
- Pipeline status is not persisted; an app restart resets in-memory status/subscriber state.
- The real pipeline depends on local Burp Suite installation paths and local Claude-agent tooling.

## Known Gaps

- No automated end-to-end suite exists under `tests/e2e/` yet.
- No stable helper scripts exist under `scripts/` yet.
- Product and architecture docs are now bootstrapped, but schema documentation for `pentest_data.db` is still implicit in code and generated artifacts.
