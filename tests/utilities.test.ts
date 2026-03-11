import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";

import { buildClientAssets } from "../src/build.ts";
import {
  ensureSchema,
  openReadOnlyDatabase,
  withReadOnlyDatabase,
  withWritableDatabase
} from "../src/db/sqlite.ts";
import {
  getErrorMessage,
  jsonStringify,
  parseJson,
  phaseHeader,
  safeEngagementName,
  sanitizeTarget,
  sleep
} from "../src/utils.ts";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

async function importFreshConstants() {
  return import(`../src/constants.ts?test=${Math.random()}`);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe("utils", () => {
  test("sanitizes targets and engagement names", () => {
    expect(sanitizeTarget("https://Demo.Example:8443/path/")).toBe(
      "demo-example-8443-path"
    );
    expect(safeEngagementName("../../demo")).toBe("demo");
  });

  test("parses JSON-like inputs without throwing", () => {
    const objectValue = { ok: true };
    expect(parseJson<unknown>(objectValue)).toBe(objectValue);
    expect(parseJson<unknown>(["a", "b"])).toEqual(["a", "b"]);
    expect(parseJson<unknown>(null)).toBe(null);
    expect(parseJson<unknown>(5)).toBe(5);
    expect(parseJson<{ name: string }>('{ "name": "demo" }')).toEqual({
      name: "demo"
    });
    expect(parseJson<unknown>("not json")).toBe("not json");
  });

  test("stringifies JSON values and reports errors", async () => {
    expect(jsonStringify(null)).toBeNull();
    expect(jsonStringify("demo")).toBe("demo");
    expect(jsonStringify({ name: "demo" })).toBe('{"name":"demo"}');
    await sleep(0);
    expect(phaseHeader("Demo")).toEqual([
      "",
      "============================================================",
      "  PHASE: Demo",
      "============================================================",
      ""
    ]);
    expect(getErrorMessage(new Error("broken"))).toBe("broken");
    expect(getErrorMessage("oops")).toBe("oops");
  });
});

describe("constants", () => {
  test("uses environment overrides when present", async () => {
    const previous = {
      db: process.env.PENTEST_DASHBOARD_DB,
      engagementId: process.env.PENTEST_DASHBOARD_ENGAGEMENT_ID,
      jar: process.env.BURP_JAR,
      java: process.env.BURP_JAVA,
      rest: process.env.BURP_REST_API,
      mcp: process.env.BURP_MCP_SSE
    };

    process.env.PENTEST_DASHBOARD_DB = "./custom.db";
    process.env.PENTEST_DASHBOARD_ENGAGEMENT_ID = "7";
    process.env.BURP_JAR = "/tmp/burp.jar";
    process.env.BURP_JAVA = "/tmp/java";
    process.env.BURP_REST_API = "http://burp-rest";
    process.env.BURP_MCP_SSE = "http://burp-sse";

    try {
      const constants = await importFreshConstants();
      expect(constants.DEFAULT_DB).toBe(resolve("./custom.db"));
      expect(constants.DEFAULT_ENGAGEMENT_ID).toBe(7);
      expect(constants.BURP_JAR).toBe("/tmp/burp.jar");
      expect(constants.BURP_JAVA).toBe("/tmp/java");
      expect(constants.BURP_REST_API).toBe("http://burp-rest");
      expect(constants.BURP_MCP_SSE).toBe("http://burp-sse");
    } finally {
      process.env.PENTEST_DASHBOARD_DB = previous.db;
      process.env.PENTEST_DASHBOARD_ENGAGEMENT_ID = previous.engagementId;
      process.env.BURP_JAR = previous.jar;
      process.env.BURP_JAVA = previous.java;
      process.env.BURP_REST_API = previous.rest;
      process.env.BURP_MCP_SSE = previous.mcp;
    }
  });

  test("falls back to defaults and detects existing databases", async () => {
    const previous = {
      db: process.env.PENTEST_DASHBOARD_DB,
      engagementId: process.env.PENTEST_DASHBOARD_ENGAGEMENT_ID
    };
    delete process.env.PENTEST_DASHBOARD_DB;
    process.env.PENTEST_DASHBOARD_ENGAGEMENT_ID = "not-a-number";

    try {
      const constants = await importFreshConstants();
      const dbPath = join(makeTempDir("eh-constants-"), "test.db");
      writeFileSync(dbPath, "");

      expect(constants.DEFAULT_DB.endsWith("pentest_data.db")).toBe(true);
      expect(constants.DEFAULT_ENGAGEMENT_ID).toBe(1);
      expect(constants.databaseExists(dbPath)).toBe(true);
      expect(
        constants.databaseExists(join(dirname(dbPath), "missing.db"))
      ).toBe(false);
    } finally {
      process.env.PENTEST_DASHBOARD_DB = previous.db;
      process.env.PENTEST_DASHBOARD_ENGAGEMENT_ID = previous.engagementId;
    }
  });
});

describe("build client assets", () => {
  test("builds JS bundles and copies styles", async () => {
    const calls: string[] = [];

    await buildClientAssets({
      mkdirFn: () => {
        calls.push("mkdir");
      },
      buildFn: async (options) => {
        calls.push(`build:${options.entrypoints.length}`);
        return { success: true, logs: [], outputs: [] } as Awaited<
          ReturnType<typeof Bun.build>
        >;
      },
      fileFn: (path) => {
        calls.push(`file:${String(path).endsWith("styles.css")}`);
        return new Blob(["body {}"]) as unknown as ReturnType<typeof Bun.file>;
      },
      writeFn: async (path) => {
        calls.push(`write:${String(path).endsWith("styles.css")}`);
        return 0;
      }
    });

    expect(calls).toEqual(["mkdir", "build:4", "file:true", "write:true"]);
  });

  test("throws build failures with bundled logs", async () => {
    expect(
      buildClientAssets({
        buildFn: async () =>
          ({
            success: false,
            logs: [{ message: "first" }, { message: "second" }]
          }) as Awaited<ReturnType<typeof Bun.build>>
      })
    ).rejects.toThrow("Asset build failed:\nfirst\nsecond");
  });
});

describe("sqlite helpers", () => {
  test("throws when opening a missing database read-only", () => {
    expect(() =>
      withReadOnlyDatabase("/tmp/does-not-exist.db", () => "never")
    ).toThrow("Database does not exist: /tmp/does-not-exist.db");
  });

  test("ensures schema upgrades older findings tables", () => {
    const dbPath = join(makeTempDir("eh-sqlite-"), "legacy.db");
    const db = new Database(dbPath, { create: true });
    db.exec(`
      CREATE TABLE findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        engagement_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        status TEXT NOT NULL DEFAULT 'confirmed',
        url TEXT,
        parameter TEXT,
        http_method TEXT,
        technique TEXT,
        detail TEXT,
        evidence TEXT,
        impact TEXT,
        remediation TEXT,
        affected_asset TEXT,
        raw TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    ensureSchema(db);
    const columns = db.query("PRAGMA table_info(findings)").all() as Array<{
      name?: string;
    }>;
    db.close();

    expect(columns.some((column) => column.name === "name")).toBe(true);
  });

  test("opens and closes writable and read-only database handles", () => {
    const dbPath = join(makeTempDir("eh-sqlite-"), "open.db");

    withWritableDatabase(dbPath, (db) => {
      db.exec("INSERT INTO engagements (target, scan_date) VALUES ('a', 'b')");
    });
    expect(existsSync(dbPath)).toBe(true);

    const count = withReadOnlyDatabase(dbPath, (db) => {
      const row = db
        .query("SELECT COUNT(*) AS count FROM engagements")
        .get() as { count: number };
      return row.count;
    });
    expect(count).toBe(1);

    const standalone = openReadOnlyDatabase(dbPath);
    standalone.close();
  });
});
