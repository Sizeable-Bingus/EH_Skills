import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { DIST_PUBLIC_DIR, PROJECT_ROOT } from "./constants.ts";

export async function buildClientAssets(): Promise<void> {
  mkdirSync(DIST_PUBLIC_DIR, { recursive: true });

  const result = await Bun.build({
    entrypoints: [
      join(PROJECT_ROOT, "src", "client", "pipeline.ts"),
      join(PROJECT_ROOT, "src", "client", "findings.ts"),
      join(PROJECT_ROOT, "src", "client", "executive_summary.ts")
    ],
    outdir: DIST_PUBLIC_DIR,
    target: "browser",
    format: "esm",
    splitting: false,
    naming: "[name].[ext]",
    minify: false
  });

  if (!result.success) {
    const logs = result.logs.map((log) => log.message).join("\n");
    throw new Error(`Asset build failed:\n${logs}`);
  }

  await Bun.write(
    join(DIST_PUBLIC_DIR, "styles.css"),
    Bun.file(join(PROJECT_ROOT, "src", "assets", "styles.css"))
  );
}

if (import.meta.main) {
  await buildClientAssets();
}
