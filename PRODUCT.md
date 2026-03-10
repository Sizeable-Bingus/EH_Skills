# Product

## Purpose

EH_Skills provides an internal penetration-testing workflow with two main parts:

- a web dashboard for reviewing engagement results
- a pipeline runner that creates or refreshes those engagement results

The current product is aimed at internal security operators working on authorized CNH-owned development or staging targets.

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
- a streaming execution log

Only one pipeline run is supported at a time.

### 4. Delete an engagement

Users can delete a selected engagement from the UI. Deletion removes the entire engagement directory. The app blocks deletion if that engagement is the one currently being scanned.

## Pipeline Behavior

The implemented pipeline has two operating modes:

- `real` mode via `pentest_pipeline/pentest_pipeline.py`
- `synthetic` mode via `pentest_pipeline/pentest_pipeline_test.py`

The real pipeline currently runs these phases:

1. Burp Suite headless scan
2. Web reconnaissance
3. Recon verification
4. Web exploitation

Artifacts are written under `engagements/<sanitized-target>/`. The dashboard expects at least:

- `pentest_data.db`
- `burp_scan.json` for real runs
- other JSON artifacts produced by the pipeline phases

## Data Shown In The Dashboard

The dashboard reads from `pentest_data.db` and currently renders:

- engagement metadata and scope details
- counts by severity and category
- full findings with severity/category filtering
- exploitation chains and ordered chain steps
- captured credential material

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
