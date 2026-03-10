# Documentation Baseline Plan

## Status

Completed on March 10, 2026.

## Goal

Create the `docs/` structure required by `AGENTS.md` and seed it with enough accurate information to support future small changes without relying on undocumented assumptions.

## Decisions

- `docs/product.md` documents only behavior that exists in the current codebase.
- `docs/architecture.md` documents the implemented runtime shape, including important constraints and missing directories referenced by `AGENTS.md`.
- This plan file acts as the initial entry in `docs/plans/` until a feature-specific plan supersedes it.

## Scope Completed

- Created `docs/product.md`
- Created `docs/architecture.md`
- Created `docs/plans/2026-03-10-documentation-baseline.md`

## Follow-Up Work

- Move or rewrite root-level plan documents into `docs/plans/` when they become active again.
- Add a documented `scripts/` workflow if stable commands become part of regular development.
- Add `tests/e2e/` coverage for critical dashboard and pipeline user flows.
- Document the SQLite schema explicitly if more code begins to depend on it.

## Remaining Risks

- The docs are based on the current implementation, not an external product spec.
- Some operational dependencies, especially Claude skills and local Burp installation details, are coupled to developer machines and may need environment-specific follow-up.
