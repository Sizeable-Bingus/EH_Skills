# TypeScript/Bun Cutover Notes

## Final Decisions

- The server now runs on Bun with Hono and TSX server rendering.
- Browser assets are bundled locally with Bun into `dist/public/`.
- SQLite reads and writes now live in `src/db/` with `bun:sqlite`; Python DB ingestion is no longer part of the runtime path.
- The real pipeline stays single-process and in-memory, but its orchestration moved to TypeScript under `src/pipeline/`.
- Claude integration uses the TypeScript SDK with project settings plus the existing `.claude/` skills, rather than embedding skill logic into the app.
- Burp remains an external dependency and still writes `burp_scan.json`.

## Follow-On Risks

- There is still no browser-level end-to-end suite for the critical workflows; current coverage is Bun unit/integration tests only.
- The real pipeline still depends on local Burp installation paths and a working Claude Code runtime, so environment setup remains an operator concern.
- Build output lives in `dist/public/` and is regenerated locally; there is no production packaging story beyond `bun run build` plus `bun run start`.
