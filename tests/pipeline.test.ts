import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { runClaudePhase } from "../src/pipeline/claude.ts";
import { runBurpScan } from "../src/pipeline/burp.ts";
import { createPipelineManager } from "../src/pipeline/manager.ts";
import { runSyntheticPipeline } from "../src/pipeline/synthetic.ts";

describe("pipeline manager", () => {
  test("enforces one run at a time and replays stream history", async () => {
    const manager = createPipelineManager({
      modeResolver: () => "synthetic",
      syntheticRunner: async ({ log }) => {
        log("PHASE: Synthetic");
        log("one");
        await new Promise((resolve) => setTimeout(resolve, 5));
        log("two");
      }
    });

    await manager.startPipeline("https://example.com");
    try {
      await manager.startPipeline("https://second.example");
      throw new Error("Expected second start to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Pipeline already running");
    }

    const queue = manager.subscribe();
    const lines: Array<string | null> = [];
    for await (const line of queue) {
      lines.push(line);
      if (line === null) {
        break;
      }
    }

    expect(lines).toContain("one");
    expect(lines).toContain("two");
    expect(manager.getState().status).toBe("complete");
  });
});

describe("synthetic pipeline", () => {
  test("writes artifacts and ingests sqlite", async () => {
    const engagementDir = mkdtempSync(join(tmpdir(), "eh-skills-synth-"));

    try {
      await runSyntheticPipeline({
        target: "https://synthetic.example",
        engagement: "synthetic-example",
        engagementDir,
        log: () => undefined
      });

      const db = new Database(join(engagementDir, "pentest_data.db"), {
        readonly: true
      });
      const counts = db
        .query("SELECT COUNT(*) AS count FROM findings")
        .get() as { count: number };
      db.close();

      expect(
        Bun.file(join(engagementDir, "recon_output.json")).size
      ).toBeGreaterThan(0);
      expect(
        Bun.file(join(engagementDir, "exploitation_output.json")).size
      ).toBeGreaterThan(0);
      expect(counts.count).toBeGreaterThan(0);
    } finally {
      rmSync(engagementDir, { recursive: true, force: true });
    }
  });
});

describe("burp adapter", () => {
  test("polls burp and writes the scan artifact", async () => {
    const engagementDir = mkdtempSync(join(tmpdir(), "eh-skills-burp-"));
    const logs: string[] = [];
    const responses = [
      new Response("ok", { status: 200 }),
      new Response("ok", { status: 200 }),
      new Response(null, { status: 201, headers: { location: "/scan/1" } }),
      new Response(JSON.stringify({ scan_status: "running" }), { status: 200 }),
      new Response(JSON.stringify({ scan_status: "succeeded", issues: [] }), {
        status: 200
      })
    ];

    try {
      const result = await runBurpScan(
        "https://example.com",
        engagementDir,
        (line) => logs.push(line),
        {
          fetchFn: () => {
            const response = responses.shift();
            if (!response) {
              throw new Error("No more mocked responses");
            }
            return Promise.resolve(response);
          },
          spawnFn: () => ({
            kill: () => undefined,
            exited: Promise.resolve(0)
          }),
          sleepFn: () => Promise.resolve(),
          readJsonFile: <T>() => Promise.resolve({ test: true } as T)
        }
      );

      expect(result.outputPath).toContain("burp_scan.json");
      expect(logs).toContain("Burp Suite is ready.");
      expect(Bun.file(result.outputPath).size).toBeGreaterThan(0);
    } finally {
      rmSync(engagementDir, { recursive: true, force: true });
    }
  });
});

describe("claude adapter", () => {
  test("streams assistant text blocks into logs", async () => {
    const logs: string[] = [];

    await runClaudePhase({
      name: "Web Reconnaissance",
      prompt: "test",
      log: (line) => logs.push(line),
      dependencies: {
        queryFn: async function* () {
          await Promise.resolve();
          yield {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "hello from claude" }]
            }
          };
          yield { type: "result", subtype: "success" };
        }
      }
    });

    expect(logs).toContain("hello from claude");
    expect(logs).toContain("--- Web Reconnaissance complete ---");
  });
});
