# Product

## Purpose

EH_Skills provides an internal penetration-testing workflow with two main parts:

- a web dashboard for reviewing engagement results
- a pipeline runner that creates or refreshes those engagement results

The current product is aimed at internal security operators working on authorized CNH-owned development or staging targets.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Web framework**: Hono with JSX/TSX server-side rendering
- **Client charts**: chart.js
- **AI integration**: Claude Code SDK (`@anthropic-ai/claude-agent-sdk`) for real pipeline phases
- **Database**: SQLite via `bun:sqlite`
- **Build**: Bun's built-in bundler (client assets compiled to `dist/public/`)

## Core User Workflows

### 1. Review the latest engagement

The dashboard serves four read-focused views over a selected engagement:

- `Executive Summary` at `/`
- `Findings` at `/findings`
- `Attack Chains` at `/chains`
- `Compromised Credentials` at `/loot`

If no `engagement` query parameter is provided, the dashboard loads the latest engagement from the default SQLite database.

### 2. Switch between engagements

Users can pick an engagement from the top-nav combobox. Each engagement maps to a directory under `engagements/<sanitized-target>/` and is considered valid when it contains `pentest_data.db`.

### 3. Start a new scan

Users can open the `New Scan` modal, enter:

- a target URL
- an optional username
- an optional password

Starting a scan triggers the pipeline API. The UI then shows:

- current pipeline status
- current phase name
- a streaming execution log via Server-Sent Events

Only one pipeline run is supported at a time.

### 4. Delete an engagement

Users can delete a selected engagement from the UI. Deletion removes the entire engagement directory. The app blocks deletion if that engagement is the one currently being scanned.

## API Endpoints

- `POST /api/pipeline/start` — start a pipeline run with target and optional credentials
- `GET /api/pipeline/status` — current pipeline state (status, target, phase, log count)
- `GET /api/pipeline/stream` — SSE stream for real-time pipeline execution logs
- `GET /api/engagements` — list all valid engagement directory names
- `DELETE /api/engagements/{name}` — delete an engagement directory (blocked while pipeline targets it)
- `/static/*` — built client assets served from `dist/public/`

## Pipeline Behavior

The pipeline has two operating modes, selected via the `PENTEST_PIPELINE_MODE` environment variable:

- `real` mode via `src/pipeline/real.ts`
- `synthetic` mode via `src/pipeline/synthetic.ts`

The mode is validated at startup; unsupported values cause an error.

### Real pipeline phases

1. **Burp Suite headless scan** — spawns a Burp process, waits for REST API and MCP SSE readiness, runs a configured scan, outputs `burp_scan.json`
2. **Web reconnaissance** — invokes Claude Code with the `web-recon` skill, outputs `recon_output.json`
3. **Recon verification** — invokes Claude Code to validate and refine recon artifacts
4. **Web exploitation** — invokes Claude Code with the `web-exploitation` skill, outputs `exploitation_output.json`

### Synthetic pipeline

Generates deterministic test data (findings, chains, credentials) without invoking Burp or Claude. Used for development and UI testing.

### Pipeline manager

The in-process pipeline manager (`src/pipeline/manager.ts`) coordinates runs:

- enforces single active run
- tracks status, target, current phase, and log lines
- extracts phase names from log output via `PHASE:` markers
- streams logs to SSE subscribers via an async queue with replay for late joiners

Artifacts are written under `engagements/<sanitized-target>/`. The dashboard expects at least:

- `pentest_data.db`
- `burp_scan.json` for real runs
- `recon_output.json` and `exploitation_output.json` from Claude phases

## Data Shown In The Dashboard

The dashboard reads from `pentest_data.db` (schema managed by `src/db/schema.ts`) and renders:

- engagement metadata and scope details
- severity and category charts (via chart.js)
- full findings list with severity/category filtering and expandable detail rows
- exploitation chains and ordered chain steps
- captured credential material
- data exfiltration records

### SQLite tables

- `engagements` — target, scope, counters, metadata
- `findings` — vulnerability details with severity, category, evidence, remediation; raw JSON stored for expansion
- `exploitation_chains` — named chains with final impact and severity
- `chain_steps` — ordered steps within a chain
- `credentials` — captured credential material
- `data_exfiltrated` — exfiltration records with source and data types

## Security

The server applies security headers via middleware:

- `Content-Security-Policy` (self-only scripts, inline styles)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`

Engagement names are normalized via `basename()` to prevent path traversal.

## Current Constraints

- The product is read-only from the dashboard except for starting scans and deleting engagements.
- There is no user authentication or role system in the app today.
- The dashboard assumes the pipeline writes data using the existing SQLite schema.
- Pipeline execution is process-local and in-memory; restarting the app loses live status state.
- The target authorization warning is UI text only; server-side authorization enforcement is not implemented.

## Non-Goals For Now

The current codebase does not implement:

- multi-user coordination
- concurrent pipeline runs
- persistent job history beyond on-disk artifacts
- API endpoints for editing findings or report content
- a generalized plugin system for alternative scan backends
