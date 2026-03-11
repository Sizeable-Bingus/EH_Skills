import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";

import {
  getFindingsPage,
  getLatestEngagementId,
  getLootPage,
  getSummaryPage as getSummaryPageDefault,
  getSummaryPage,
  resolveEngagementDb,
  listEngagements,
  resolveEngagementDbInDir,
  UnknownEngagementError
} from "../src/db/dashboard.ts";
import { ingestExploitationOutput } from "../src/db/ingest.ts";
import { createSyntheticArtifacts } from "../src/pipeline/synthetic.ts";
import { withReadOnlyDatabase } from "../src/db/sqlite.ts";
import type { ExploitationOutput } from "../src/types.ts";
import { DEFAULT_DB } from "../src/constants.ts";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function createOutput(
  target = "https://demo.example",
  scanDate = "2026-03-11T00:00:00.000Z"
): ExploitationOutput {
  const { exploitation } = createSyntheticArtifacts(target, "/tmp/recon.json");
  exploitation.meta.scan_date = scanDate;
  return exploitation;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe("dashboard shaping edge cases", () => {
  test("falls back for missing databases and missing engagement names", () => {
    expect(getLatestEngagementId("/tmp/missing.db", 42)).toBe(42);
    expect(listEngagements("/tmp/also-missing")).toEqual([]);
    expect(() =>
      resolveEngagementDbInDir("missing", "/tmp/also-missing")
    ).toThrow(UnknownEngagementError);
    expect(() => getSummaryPage("/tmp/missing.db", 1)).toThrow();
  });

  test("resolves the latest engagement and sanitizes explicit names", () => {
    const root = makeTempDir("eh-dash-resolve-");
    for (const [name, scanDate] of [
      ["alpha", "2026-03-10T00:00:00.000Z"],
      ["beta", "2026-03-11T00:00:00.000Z"]
    ] as const) {
      const dbPath = join(root, name, "pentest_data.db");
      mkdirSync(join(root, name), { recursive: true });
      ingestExploitationOutput(
        createOutput(`https://${name}.example`, scanDate),
        dbPath,
        {
          includeAll: true
        }
      );
    }

    expect(resolveEngagementDbInDir(null, root).dbPath).toBe(
      join(root, "beta", "pentest_data.db")
    );
    expect(resolveEngagementDbInDir("../alpha", root).dbPath).toBe(
      join(root, "alpha", "pentest_data.db")
    );
  });

  test("falls back when latest engagement records are missing and sorts ties deterministically", () => {
    const emptyRoot = makeTempDir("eh-dash-empty-root-");
    mkdirSync(join(emptyRoot, "empty"), { recursive: true });
    let db = new Database(join(emptyRoot, "empty", "pentest_data.db"), {
      create: true
    });
    db.exec(
      "CREATE TABLE engagements (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT, scan_date TEXT)"
    );
    db.close();

    expect(resolveEngagementDbInDir(null, emptyRoot)).toEqual({
      dbPath: DEFAULT_DB,
      engagementId: getLatestEngagementId(DEFAULT_DB)
    });

    const sameDateRoot = makeTempDir("eh-dash-sort-date-");
    for (const name of ["alpha", "beta"]) {
      const dbPath = join(sameDateRoot, name, "pentest_data.db");
      mkdirSync(join(sameDateRoot, name), { recursive: true });
      ingestExploitationOutput(
        createOutput(`https://${name}.example`, "2026-03-11T00:00:00.000Z"),
        dbPath,
        { includeAll: true }
      );
    }
    expect(resolveEngagementDbInDir(null, sameDateRoot).dbPath).toBe(
      join(sameDateRoot, "alpha", "pentest_data.db")
    );

    const sameDateDifferentIdRoot = makeTempDir("eh-dash-sort-id-");
    const firstPath = join(sameDateDifferentIdRoot, "first", "pentest_data.db");
    mkdirSync(join(sameDateDifferentIdRoot, "first"), { recursive: true });
    ingestExploitationOutput(
      createOutput("https://first.example", "2026-03-11T00:00:00.000Z"),
      firstPath,
      { includeAll: true }
    );

    const secondPath = join(
      sameDateDifferentIdRoot,
      "second",
      "pentest_data.db"
    );
    mkdirSync(join(sameDateDifferentIdRoot, "second"), { recursive: true });
    ingestExploitationOutput(
      createOutput("https://second.example", "2026-03-11T00:00:00.000Z"),
      secondPath,
      { includeAll: true }
    );
    ingestExploitationOutput(
      createOutput("https://second.example", "2026-03-11T00:00:00.000Z"),
      secondPath,
      { includeAll: true, force: true }
    );

    expect(resolveEngagementDbInDir(null, sameDateDifferentIdRoot).dbPath).toBe(
      secondPath
    );
  });

  test("normalizes object, string, legacy, and empty scope variants", () => {
    const root = makeTempDir("eh-dash-scope-");

    const objectDb = join(root, "object.db");
    ingestExploitationOutput(createOutput("https://object.example"), objectDb, {
      includeAll: true
    });
    let db = new Database(objectDb);
    db.exec("ALTER TABLE engagements ADD COLUMN scope TEXT");
    db.query("UPDATE engagements SET scope = ?").run(
      JSON.stringify({
        in_scope: ["https://object.example"],
        out_of_scope: ["/admin"],
        rules_of_engagement: "Only synthetic scope"
      })
    );
    db.close();

    const objectSummary = getSummaryPage(
      objectDb,
      getLatestEngagementId(objectDb)
    );
    expect(objectSummary.engagement?.scope).toEqual({
      in_scope: ["https://object.example"],
      out_of_scope: ["/admin"],
      rules_of_engagement: "Only synthetic scope"
    });

    const stringDb = join(root, "string.db");
    ingestExploitationOutput(createOutput("https://string.example"), stringDb, {
      includeAll: true
    });
    db = new Database(stringDb);
    db.exec("ALTER TABLE engagements ADD COLUMN scope TEXT");
    db.query("UPDATE engagements SET scope = ?").run("Legacy flat scope text");
    db.close();

    const stringSummary = getSummaryPage(
      stringDb,
      getLatestEngagementId(stringDb)
    );
    expect(stringSummary.engagement?.scope).toBe("Legacy flat scope text");

    db = new Database(stringDb);
    db.query("UPDATE engagements SET scope = ?").run(JSON.stringify(["bad"]));
    db.close();
    const arraySummary = getSummaryPage(
      stringDb,
      getLatestEngagementId(stringDb)
    );
    expect(arraySummary.engagement?.scope).toEqual({
      in_scope: ["https://string.example"],
      out_of_scope: [],
      rules_of_engagement: "SYNTHETIC TEST DATA — not a real engagement"
    });

    const legacyDb = join(root, "legacy.db");
    ingestExploitationOutput(createOutput("https://legacy.example"), legacyDb, {
      includeAll: true
    });
    const legacySummary = getSummaryPage(
      legacyDb,
      getLatestEngagementId(legacyDb)
    );
    expect(legacySummary.engagement?.scope).toEqual({
      in_scope: ["https://legacy.example"],
      out_of_scope: [],
      rules_of_engagement: "SYNTHETIC TEST DATA — not a real engagement"
    });

    const emptyDb = join(root, "empty.db");
    ingestExploitationOutput(createOutput("https://empty.example"), emptyDb, {
      includeAll: true
    });
    db = new Database(emptyDb);
    db.query(
      "UPDATE engagements SET scope_in = NULL, scope_out = NULL, rules = NULL"
    ).run();
    db.close();

    const emptySummary = getSummaryPage(
      emptyDb,
      getLatestEngagementId(emptyDb)
    );
    expect(emptySummary.engagement?.scope).toBeNull();
  });

  test("filters findings and falls back from legacy method columns", () => {
    const dbPath = join(makeTempDir("eh-findings-"), "pentest_data.db");
    ingestExploitationOutput(createOutput(), dbPath, {
      includeAll: true
    });

    const db = new Database(dbPath);
    db.exec("ALTER TABLE findings ADD COLUMN method TEXT");
    db.query(
      "INSERT INTO findings (engagement_id, name, category, severity, status, detail, raw, method, http_method) VALUES (1, 'Legacy', 'legacy', 'low', 'confirmed', 'old method', '{}', 'PATCH', NULL)"
    ).run();
    db.close();

    const allFindings = getFindingsPage(dbPath, 1);
    const bothFilters = getFindingsPage(dbPath, 1, {
      severity: "low",
      category: "legacy"
    });

    expect(allFindings.severities.length).toBeGreaterThan(0);
    expect(allFindings.categories.length).toBeGreaterThan(0);
    expect(bothFilters.findings).toHaveLength(1);
    expect(bothFilters.findings[0]?.method).toBe("PATCH");
  });

  test("applies credential detail and evidence fallbacks", () => {
    const dbPath = join(makeTempDir("eh-loot-"), "pentest_data.db");
    ingestExploitationOutput(createOutput(), dbPath, {
      includeAll: true
    });

    const db = new Database(dbPath);
    db.query(
      "INSERT INTO credentials (engagement_id, source, username, password_hash, password_cracked, service) VALUES (1, NULL, NULL, NULL, NULL, '')"
    ).run();
    db.query(
      "INSERT INTO credentials (engagement_id, source, username, password_hash, password_cracked, service) VALUES (1, 'test', 'bob', 'hash', 'secret', 'ssh')"
    ).run();
    db.close();

    const loot = getLootPage(dbPath, 1);
    expect(loot.credentials.at(-1)).toEqual({
      technique: "test",
      detail: "bob | ssh",
      evidence: "Hash: hash | Cracked: secret"
    });
    expect(loot.credentials.at(-2)).toEqual({
      technique: "Unknown source",
      detail: "Unknown username",
      evidence: "Captured credential material"
    });
  });

  test("covers default engagement resolution helpers", () => {
    expect(resolveEngagementDb(null).dbPath.endsWith("pentest_data.db")).toBe(
      true
    );
    expect(getSummaryPageDefault()).toBeDefined();
  });

  test("returns an empty summary when the requested engagement row is missing", () => {
    const dbPath = join(makeTempDir("eh-summary-missing-row-"), "pentest.db");
    ingestExploitationOutput(createOutput("https://summary.example"), dbPath, {
      includeAll: true
    });

    const summary = getSummaryPage(dbPath, 999);
    expect(summary.engagement).toBeNull();
    expect(summary.stats).toEqual({
      total_findings: 0,
      total_credentials: 0,
      total_chains: 0
    });
  });
});

describe("ingest error handling", () => {
  test("validates required top-level fields and finding fields", () => {
    const dbPath = join(makeTempDir("eh-ingest-errors-"), "pentest_data.db");
    const base = createOutput();

    expect(() =>
      ingestExploitationOutput(
        { ...base, meta: { ...base.meta, target: "" } },
        dbPath
      )
    ).toThrow("'meta.target' is required");
    expect(() =>
      ingestExploitationOutput(
        { ...base, meta: { ...base.meta, scan_date: "" } },
        dbPath
      )
    ).toThrow("'meta.scan_date' is required");
    expect(() =>
      ingestExploitationOutput({ ...base, findings: null as never }, dbPath)
    ).toThrow("'findings' is required");
    expect(() =>
      ingestExploitationOutput(
        {
          ...base,
          findings: [{ ...base.findings[0], name: "" }] as typeof base.findings
        },
        dbPath
      )
    ).toThrow("Each finding must include a non-empty 'name'");
    expect(() =>
      ingestExploitationOutput(
        {
          ...base,
          findings: [
            { ...base.findings[0], category: "" }
          ] as typeof base.findings
        },
        dbPath
      )
    ).toThrow(
      "Finding 'Admin panel accepts default credentials' is missing 'category'"
    );
    expect(() =>
      ingestExploitationOutput(
        {
          ...base,
          findings: [
            { ...base.findings[0], detail: "" }
          ] as typeof base.findings
        },
        dbPath
      )
    ).toThrow(
      "Finding 'Admin panel accepts default credentials' is missing 'detail'"
    );
  });

  test("supports confirmed-only filtering, duplicate detection, force, and rollback", () => {
    const dbPath = join(makeTempDir("eh-ingest-"), "pentest_data.db");
    const output = createOutput();

    const confirmedOnlyId = ingestExploitationOutput(output, dbPath);
    const confirmedCount = withReadOnlyDatabase(dbPath, (db) => {
      const row = db
        .query("SELECT COUNT(*) AS count FROM findings WHERE engagement_id = ?")
        .get(confirmedOnlyId) as { count: number };
      return row.count;
    });
    expect(confirmedCount).toBe(
      output.findings.filter((finding) => finding.status === "confirmed").length
    );

    expect(() =>
      ingestExploitationOutput(output, dbPath, { includeAll: true })
    ).toThrow(
      `Engagement already exists for ${output.meta.target} at ${output.meta.scan_date}`
    );

    const forcedId = ingestExploitationOutput(output, dbPath, {
      force: true,
      includeAll: true
    });
    expect(forcedId).toBeGreaterThan(confirmedOnlyId);

    const rollbackDb = join(
      makeTempDir("eh-ingest-rollback-"),
      "pentest_data.db"
    );
    const brokenChain = {
      ...createOutput("https://rollback.example"),
      exploitation_chains: [{ name: null as never }]
    };

    expect(() =>
      ingestExploitationOutput(brokenChain as ExploitationOutput, rollbackDb, {
        includeAll: true
      })
    ).toThrow();
    const engagementCount = withReadOnlyDatabase(rollbackDb, (db) => {
      const row = db
        .query("SELECT COUNT(*) AS count FROM engagements")
        .get() as { count: number };
      return row.count;
    });
    expect(engagementCount).toBe(0);
  });
});
