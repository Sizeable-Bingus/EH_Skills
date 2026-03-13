import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { Database } from "bun:sqlite";

const root = join(process.cwd(), "tests", "e2e", "tmp-engagements");
const fixtureDb = join(
  process.cwd(),
  "engagements",
  "example-com",
  "pentest_data.db",
);

rmSync(root, { recursive: true, force: true });

for (const [name, target, scanDate] of [
  ["alpha", "https://alpha.example", "2026-03-10T00:00:00.000Z"],
  ["bravo", "https://bravo.example", "2026-03-11T00:00:00.000Z"],
] as const) {
  const engagementDir = join(root, name);
  mkdirSync(engagementDir, { recursive: true });
  const dbPath = join(engagementDir, "pentest_data.db");
  cpSync(fixtureDb, dbPath);

  const db = new Database(dbPath);
  db.query("UPDATE engagements SET target = ?, scan_date = ?").run(
    target,
    scanDate,
  );
  db.close();
}

console.log(root);
