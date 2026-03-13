import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createApp, startServer } from "../src/server.tsx";
import { ensureSchema } from "../src/db/sqlite.ts";
import { createPipelineManager } from "../src/pipeline/manager.ts";
import { ingestExploitationOutput } from "../src/db/ingest.ts";
import { createSyntheticArtifacts } from "../src/pipeline/synthetic.ts";

const fixtureDb = join(
  process.cwd(),
  "engagements",
  "example-com",
  "pentest_data.db",
);

describe("route headers and pipeline APIs", () => {
  test("applies security headers to HTML, JSON, SSE, and static responses", async () => {
    const manager = {
      getState: () => ({
        status: "complete",
        target: "https://example.com",
        engagement: "example-com",
        currentPhase: "Complete",
        logLines: ["done"],
      }),
      startPipeline: () => Promise.resolve(),
      subscribe: () =>
        ({
          async *[Symbol.asyncIterator]() {
            yield "hello";
            yield null;
          },
        }) as AsyncIterable<string | null>,
      unsubscribe: () => undefined,
    };
    const app = createApp({ pipelineManager: manager as never });

    for (const path of [
      "/",
      "/api/engagements",
      "/api/pipeline/stream",
      "/static/styles.css",
    ]) {
      const response = await app.request(path);
      expect(response.headers.get("content-security-policy")).toContain(
        "default-src 'self'",
      );
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  test("handles pipeline start success, validation, conflict, and status variants", async () => {
    const states = [
      {
        status: "idle",
        currentPhase: "",
        target: "",
        engagement: "",
        logLines: [],
      },
      {
        status: "running",
        currentPhase: "Recon",
        target: "https://run.example",
        engagement: "run-example",
        logLines: ["a"],
      },
      {
        status: "complete",
        currentPhase: "Complete",
        target: "https://done.example",
        engagement: "done-example",
        logLines: ["a", "b"],
      },
      {
        status: "error",
        currentPhase: "Error: failed",
        target: "https://bad.example",
        engagement: "bad-example",
        logLines: ["a", "b", "c"],
      },
    ];
    let stateIndex = 0;
    let startMode: "success" | "conflict" = "success";
    const manager = {
      getState: () => states[stateIndex] as (typeof states)[number],
      startPipeline: async () => {
        if (startMode === "conflict") {
          throw new Error("already running");
        }
      },
      subscribe: () =>
        ({
          async *[Symbol.asyncIterator]() {
            yield null;
          },
        }) as AsyncIterable<string | null>,
      unsubscribe: () => undefined,
    };
    const app = createApp({ pipelineManager: manager as never });

    const missingTarget = await app.request("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(missingTarget.status).toBe(400);

    const started = await app.request("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "https://demo.example" }),
    });
    expect(await started.json()).toEqual({
      status: "started",
      target: "https://demo.example",
    });

    startMode = "conflict";
    const conflict = await app.request("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "https://demo.example" }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ detail: "already running" });

    for (const [index, expected] of states.entries()) {
      stateIndex = index;
      const response = await app.request("/api/pipeline/status");
      expect(await response.json()).toEqual({
        status: expected.status,
        target: expected.target,
        current_phase: expected.currentPhase,
        line_count: expected.logLines.length,
      });
    }
  });

  test("streams SSE lines, emits done payloads, and unsubscribes on completion", async () => {
    let unsubscribed = false;
    const manager = {
      getState: () => ({
        status: "complete",
        target: "https://demo.example",
        engagement: "demo",
        currentPhase: "Complete",
        logLines: ["first"],
      }),
      startPipeline: () => Promise.resolve(),
      subscribe: () =>
        ({
          async *[Symbol.asyncIterator]() {
            yield "first";
            yield null;
          },
        }) as AsyncIterable<string | null>,
      unsubscribe: () => {
        unsubscribed = true;
      },
    };
    const app = createApp({ pipelineManager: manager as never });

    const response = await app.request("/api/pipeline/stream");
    const body = await response.text();
    expect(body).toContain("data: first");
    expect(body).toContain("event: done");
    expect(body).toContain('"status":"complete"');
    expect(unsubscribed).toBe(true);
  });
});

describe("page rendering branches and deletion behavior", () => {
  let engagementsDir: string;

  beforeEach(() => {
    engagementsDir = mkdtempSync(join(tmpdir(), "eh-routes-extra-"));
  });

  afterEach(() => {
    rmSync(engagementsDir, { recursive: true, force: true });
  });

  test("renders empty and zero-finding dashboard states", async () => {
    let app = createApp({ engagementsDir });
    let response = await app.request("/");
    expect(await response.text()).toContain("No engagements found");

    const dbPath = join(engagementsDir, "empty-findings", "pentest_data.db");
    mkdirSync(join(engagementsDir, "empty-findings"), { recursive: true });
    const db = new Database(dbPath, { create: true });
    ensureSchema(db);
    db.query("INSERT INTO engagements (target, scan_date) VALUES (?, ?)").run(
      "https://empty.example",
      "2026-03-11T00:00:00.000Z",
    );
    db.close();

    app = createApp({ engagementsDir });
    response = await app.request("/");
    const html = await response.text();
    expect(html).toContain("https://empty.example");
    expect(html).toContain("—");
  });

  test("renders summary scope variants and tool metadata", async () => {
    const base = createSyntheticArtifacts(
      "https://summary.example",
      "/tmp/recon.json",
    ).exploitation;

    const structuredPath = join(
      engagementsDir,
      "structured",
      "pentest_data.db",
    );
    mkdirSync(join(engagementsDir, "structured"), { recursive: true });
    ingestExploitationOutput(base, structuredPath, { includeAll: true });

    let db = new Database(structuredPath);
    db.query(
      "UPDATE engagements SET duration_sec = 120, tools_used = ?, scope_out = ?",
    ).run(JSON.stringify(["burp", "claude"]), JSON.stringify(["/admin"]));
    db.close();

    const stringPath = join(engagementsDir, "string", "pentest_data.db");
    mkdirSync(join(engagementsDir, "string"), { recursive: true });
    ingestExploitationOutput(
      {
        ...base,
        meta: {
          ...base.meta,
          target: "https://string.example",
          scan_date: "2026-03-12T00:00:00.000Z",
        },
      },
      stringPath,
      { includeAll: true },
    );
    db = new Database(stringPath);
    db.exec("ALTER TABLE engagements ADD COLUMN scope TEXT");
    db.query("UPDATE engagements SET scope = ?").run("Legacy flat scope text");
    db.close();

    const app = createApp({ engagementsDir });
    const structured = await app.request("/summary?engagement=structured");
    const structuredHtml = await structured.text();
    expect(structuredHtml).toContain("Duration: 2.0 min");
    expect(structuredHtml).toContain("burp");
    expect(structuredHtml).toContain("Out of Scope");
    expect(structuredHtml).toContain("Rules of Engagement");

    const stringScope = await app.request("/summary?engagement=string");
    expect(await stringScope.text()).toContain("Legacy flat scope text");
  });

  test("renders the findings clear link when filters are active", async () => {
    const base = createSyntheticArtifacts(
      "https://findings.example",
      "/tmp/recon.json",
    ).exploitation;
    const dbPath = join(engagementsDir, "findings", "pentest_data.db");
    mkdirSync(join(engagementsDir, "findings"), { recursive: true });
    ingestExploitationOutput(base, dbPath, { includeAll: true });

    const app = createApp({ engagementsDir });
    const response = await app.request(
      "/findings?engagement=findings&severity=high",
    );

    expect(await response.text()).toContain(
      'href="/findings?engagement=findings"',
    );
  });

  test("deletes sanitized names and reports unknown engagements", async () => {
    mkdirSync(join(engagementsDir, "demo"), { recursive: true });
    cpSync(fixtureDb, join(engagementsDir, "demo", "pentest_data.db"));
    const app = createApp({
      engagementsDir,
      pipelineManager: createPipelineManager({
        modeResolver: () => "synthetic",
        syntheticRunner: async () => undefined,
      }),
    });

    const deleted = await app.request("/api/engagements/..%2Fdemo", {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({
      status: "deleted",
      engagement: "../demo",
    });

    const missing = await app.request("/api/engagements/ghost", {
      method: "DELETE",
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      detail: "Unknown engagement: ghost",
    });
  });

  test("rethrows non-engagement page errors", async () => {
    mkdirSync(join(engagementsDir, "broken"), { recursive: true });
    await Bun.write(
      join(engagementsDir, "broken", "pentest_data.db"),
      "not sqlite",
    );
    const app = createApp({ engagementsDir });
    const originalConsoleError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      for (const path of [
        "/summary?engagement=broken",
        "/findings?engagement=broken",
        "/chains?engagement=broken",
        "/loot?engagement=broken",
      ]) {
        const response = await app.request(path);
        expect(response.status).toBe(500);
        expect(await response.text()).toBe("Internal Server Error");
      }
      expect(errors).toEqual([]);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("JSON API endpoints return data for all four pages", async () => {
    const base = createSyntheticArtifacts(
      "https://api.example",
      "/tmp/recon.json",
    ).exploitation;
    const dbPath = join(engagementsDir, "apitest", "pentest_data.db");
    mkdirSync(join(engagementsDir, "apitest"), { recursive: true });
    ingestExploitationOutput(base, dbPath, { includeAll: true });

    const app = createApp({ engagementsDir });

    const summary = await app.request("/api/summary?engagement=apitest");
    expect(summary.status).toBe(200);
    const summaryJson = await summary.json();
    expect(summaryJson).toHaveProperty("engagement");

    const findings = await app.request(
      "/api/findings?engagement=apitest&severity=high",
    );
    expect(findings.status).toBe(200);
    const findingsJson = await findings.json();
    expect(findingsJson).toHaveProperty("findings");

    const chains = await app.request("/api/chains?engagement=apitest");
    expect(chains.status).toBe(200);
    const chainsJson = await chains.json();
    expect(chainsJson).toHaveProperty("chains");

    const loot = await app.request("/api/loot?engagement=apitest");
    expect(loot.status).toBe(200);
    const lootJson = await loot.json();
    expect(lootJson).toHaveProperty("credentials");
  });

  test("JSON API endpoints return 404 JSON for unknown engagements", async () => {
    const app = createApp({ engagementsDir });

    for (const path of [
      "/api/summary?engagement=missing",
      "/api/findings?engagement=missing",
      "/api/chains?engagement=missing",
      "/api/loot?engagement=missing",
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ detail: "Unknown engagement: missing" });
    }
  });

  test("JSON API endpoints return 500 JSON for broken databases", async () => {
    mkdirSync(join(engagementsDir, "broken"), { recursive: true });
    await Bun.write(
      join(engagementsDir, "broken", "pentest_data.db"),
      "not sqlite",
    );
    const app = createApp({ engagementsDir });
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      for (const path of [
        "/api/summary?engagement=broken",
        "/api/findings?engagement=broken",
        "/api/chains?engagement=broken",
        "/api/loot?engagement=broken",
      ]) {
        const response = await app.request(path);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body).toEqual({ detail: "Internal Server Error" });
      }
    } finally {
      console.error = originalConsoleError;
    }
  });
});

describe("startServer", () => {
  test("builds assets by default and can skip the build step", async () => {
    const logs: string[] = [];
    const served: Array<{ port: number; hostname: string }> = [];

    const first = await startServer({
      buildAssets: async () => {
        logs.push("build");
      },
      serveFn: ({ port, hostname }) => {
        served.push({ port, hostname });
        return { stop: true };
      },
      logger: (message) => {
        logs.push(message);
      },
      port: 8123,
      hostname: "127.0.0.1",
    });
    expect(first.port).toBe(8123);
    expect(logs).toEqual([
      "build",
      "Pentest dashboard listening on http://127.0.0.1:8123",
    ]);
    expect(served).toEqual([{ port: 8123, hostname: "127.0.0.1" }]);

    logs.length = 0;
    served.length = 0;
    await startServer({
      skipAssetBuild: true,
      buildAssets: async () => {
        logs.push("should not run");
      },
      serveFn: ({ port, hostname }) => {
        served.push({ port, hostname });
        return { stop: true };
      },
      logger: (message) => {
        logs.push(message);
      },
      port: 9000,
      hostname: "0.0.0.0",
    });
    expect(logs).toEqual([
      "Pentest dashboard listening on http://0.0.0.0:9000",
    ]);
    expect(served).toEqual([{ port: 9000, hostname: "0.0.0.0" }]);
  });

  test("uses Bun.serve when no custom server is provided", async () => {
    const originalServe = Bun.serve;
    const calls: Array<{ port: number; hostname: string }> = [];

    Object.assign(Bun, {
      serve: (options: {
        fetch: typeof createApp.prototype.fetch;
        port: number;
        hostname: string;
      }) => {
        calls.push({ port: options.port, hostname: options.hostname });
        return { stop: true };
      },
    });

    try {
      const result = await startServer({
        skipAssetBuild: true,
        port: 8111,
        hostname: "127.0.0.2",
        logger: () => undefined,
      });
      expect(result.port).toBe(8111);
      expect(calls).toEqual([{ port: 8111, hostname: "127.0.0.2" }]);
    } finally {
      Object.assign(Bun, { serve: originalServe });
    }
  });
});
