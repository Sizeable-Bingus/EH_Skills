# Agent Instructions

## Mission

Ship small, correct changes with minimal drift from documented product and architecture decisions.

## Read first

Before editing code, read:

1. `PRODUCT.md`
2. `ARCHITECTURE.md`
3. the newest relevant file in `docs/plans/`

## Repo map

- `src/`: Bun/Hono application code, TSX pages, browser TypeScript, SQLite access, and pipeline runtime
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

## Pull request flow

Repeat steps 2–5 until the code review comes back clean.

1. Create the PR:
   - `git push -u origin <branch>`
   - `gh pr create --base <target-branch> --head <branch> --title "..." --body "..."`
2. Watch unresolved code review comments with the repo script:
   - `scripts/pr-review-loop.sh watch --interval 30 --timeout 600`
   - The script defaults to the current branch's PR via `gh pr view`.
   - The watch timeout resets after each local commit so the loop stays alive while fixes are being pushed.
   - Use `scripts/pr-review-loop.sh status` for a one-shot snapshot.
3. Implement fixes for each comment.
4. Resolve review threads after the fix is pushed:
   - `scripts/pr-review-loop.sh resolve --thread-id <thread-id>`
5. Commit and push fixes:
   - `git add <files> && git commit -m "..."`
   - `git push`

Use the script for the polling loop instead of retyping `gh api` queries in the
prompt.

## Definition of done

A task is done when:

- the requested behavior is implemented
- relevant docs are updated
- `bun run validate` passes (including any "pre-existing" issues)
- remaining risks or unknowns are written down
