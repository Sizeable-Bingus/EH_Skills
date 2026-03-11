# Dashboard And UI Refactors

## Status

Completed on March 11, 2026.

## Goal

Address the review findings around dead code, simplicity, readability, and
reusability without changing documented product behavior.

## Scope

- Refactor dashboard aggregation so each engagement database is opened once per
  dashboard row instead of multiple times.
- Extract shared chart bootstrap logic used by the dashboard and executive
  summary client pages.
- Split the pipeline UI client bootstrap into smaller feature-focused modules
  while preserving the same DOM contract and exported initializer.
- Remove runtime exports that are only referenced by tests.

## Decisions

- Keep `initializePipelineUi` as the public entrypoint used by the bundle, but
  move scan modal, pipeline status/SSE, engagement combobox, and delete-flow
  behavior into dedicated client modules.
- Keep dashboard page behavior and JSON shapes unchanged; the refactor is
  limited to internal query structure and helper reuse.
- Replace dead test-only runtime helpers with direct test imports or test calls
  to the remaining supported APIs.

## Risks

- The pipeline UI split touches event wiring and shared mutable state, so the
  existing client tests must continue to cover bootstrap, SSE, combobox, and
  delete flows.
- Dashboard aggregation changes must preserve the existing totals, severity
  ordering, and latest-engagement selection behavior.

## Scope Completed

- Refactored `src/db/dashboard.ts` so dashboard aggregation opens each
  engagement database once and reuses a dedicated summary helper.
- Extracted shared chart bootstrap logic into
  `src/client/summary_charts.ts` and reused it from both chart pages.
- Split `src/client/pipeline_ui.ts` into smaller client modules for shared DOM
  helpers, engagement selection, pipeline status/SSE updates, scan controls,
  and delete controls.
- Removed the dead runtime exports and updated tests to call the supported APIs
  directly.

## Validation

- `bun test tests/client.test.ts tests/utilities.test.ts tests/db-extra.test.ts`
- `bun run validate`
