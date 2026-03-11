# PR Review Loop

## Status

Completed on March 11, 2026.

## Goal

Add a stable repo-owned workflow for polling PR review comments so agents can
re-run the same review loop without restating the GitHub queries in every
prompt.

## Decisions

- `scripts/pr-review-loop.sh` is the canonical helper for PR review polling and
  thread resolution.
- The script defaults to the current branch's PR and the
  `Sizeable-Bingus/EH_Skills` repository, with configurable PR number, polling
  interval, and timeout.
- The `watch` command emits one JSON line per poll so an agent can monitor the
  stream and react when unresolved review threads appear.
- The `watch` timeout resets whenever the local `HEAD` commit changes so review
  loops do not expire while fixes are actively being committed.
- The `resolve` command only resolves a supplied thread ID; code changes,
  validation, commit, and push still happen outside the script.
- `AGENTS.md` should instruct agents to use this script instead of inlining ad
  hoc `gh api` polling commands.

## Scope Completed

- Added `scripts/pr-review-loop.sh` with `status`, `watch`, and `resolve`
  commands.
- Updated `AGENTS.md` to make the script the default PR review loop entrypoint.
- Updated `ARCHITECTURE.md` to document the new stable `scripts/` workflow.

## Remaining Risks

- The workflow still depends on authenticated `gh` CLI access.
- The script automates polling and thread resolution, but it cannot implement or
  validate fixes by itself.
