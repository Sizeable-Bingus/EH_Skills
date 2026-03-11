#!/usr/bin/env bun
// Migrate existing engagement databases to consolidated categories.
// Iterates engagements/<name>/pentest_data.db and updates category values in-place.
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { migrateCategories } from "../src/db/categories.ts";

const engagementsDir = join(process.cwd(), "engagements");

if (!existsSync(engagementsDir)) {
  console.log("No engagements/ directory found — nothing to migrate.");
  process.exit(0);
}

const dirs = readdirSync(engagementsDir, { withFileTypes: true }).filter((d) =>
  d.isDirectory()
);

let totalUpdated = 0;

for (const dir of dirs) {
  const dbPath = join(engagementsDir, dir.name, "pentest_data.db");
  if (!existsSync(dbPath)) continue;

  const updated = migrateCategories(dbPath);
  totalUpdated += updated;
  console.log(`  ${dir.name}: ${updated} rows updated`);
}

console.log(
  `\nMigration complete. ${totalUpdated} total rows updated across ${dirs.length} engagement(s).`
);
