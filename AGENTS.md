# Agent Instructions

## Mission

Ship small, correct changes with minimal drift from documented product and architecture decisions.

## Read first

Before editing code, read:

1. `PRODUCT.md`
2. `ARCHITECTURE.md`
3. the newest relevant file in `docs/plans/`

## Repo map

- `dashboard/`: application code
- `docs/`: durable project knowledge
- `scripts/`: stable commands the agent should use
- `tests/e2e/`: critical user-flow checks

## Working rules

- Keep changes small and reversible.
- Do not invent product behavior that is not documented.
- If behavior changes, update docs in the same change.
- If a task is larger than a small bugfix, create or update a file in `docs/plans/`.
- Prefer editing existing patterns over introducing new abstractions.
- If a failure repeats, add a check, script, test, or doc so it is cheaper next time.

## Definition of done

A task is done when:

- the requested behavior is implemented
- relevant docs are updated
- `uv run pyright` and `uv run ruff check` pass
- remaining risks or unknowns are written down
