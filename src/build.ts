import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { DIST_PUBLIC_DIR, PROJECT_ROOT } from "./constants.ts";

export interface BuildClientAssetsDependencies {
  mkdirFn?: typeof mkdirSync;
  buildFn?: typeof Bun.build;
  writeFn?: typeof Bun.write;
  fileFn?: typeof Bun.file;
}

export async function buildClientAssets(
  dependencies: BuildClientAssetsDependencies = {}
): Promise<void> {
  const mkdirFn = dependencies.mkdirFn ?? mkdirSync;
  const buildFn = dependencies.buildFn ?? Bun.build;
  const writeFn = dependencies.writeFn ?? Bun.write;
  const fileFn = dependencies.fileFn ?? Bun.file;

  mkdirFn(DIST_PUBLIC_DIR, { recursive: true });

  const result = await buildFn({
    entrypoints: [
      join(PROJECT_ROOT, "src", "client", "pipeline.ts"),
      join(PROJECT_ROOT, "src", "client", "findings.ts"),
      join(PROJECT_ROOT, "src", "client", "executive_summary.ts"),
      join(PROJECT_ROOT, "src", "client", "dashboard.ts")
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

  await writeFn(
    join(DIST_PUBLIC_DIR, "styles.css"),
    fileFn(join(PROJECT_ROOT, "src", "assets", "styles.css"))
  );
}
