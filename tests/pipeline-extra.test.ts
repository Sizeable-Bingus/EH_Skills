import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { withReadOnlyDatabase } from "../src/db/sqlite.ts";
import { runBurpScan } from "../src/pipeline/burp.ts";
import { runClaudePhase } from "../src/pipeline/claude.ts";
import { createPipelineManager } from "../src/pipeline/manager.ts";
import { runRealPipeline } from "../src/pipeline/real.ts";
import {
  createSyntheticArtifacts,
  runSyntheticPipeline,
} from "../src/pipeline/synthetic.ts";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe("pipeline manager branches", () => {
  test("transitions to error, replays done markers, and supports unsubscribe", async () => {
    const manager = createPipelineManager({
      modeResolver: () => "synthetic",
      syntheticRunner: async ({ log }) => {
        log("PHASE: Broken");
        await new Promise((resolve) => setTimeout(resolve, 0));
        throw new Error("runner failed");
      },
    });

    await manager.startPipeline("https://broken.example");
    const liveQueue = manager.subscribe();

    const lines: Array<string | null> = [];
    for await (const line of liveQueue) {
      lines.push(line);
      if (line === null) {
        break;
      }
    }

    expect(lines).toContain("ERROR: runner failed");
    expect(manager.getState()).toMatchObject({
      status: "error",
      currentPhase: "Error: runner failed",
    });

    const replayQueue = manager.subscribe();
    const replayed: Array<string | null> = [];
    for await (const line of replayQueue) {
      replayed.push(line);
      if (line === null) {
        break;
      }
    }
    expect(replayed.at(-1)).toBeNull();

    const idleManager = createPipelineManager({
      modeResolver: () => "synthetic",
      syntheticRunner: async () => undefined,
    });
    const idleQueue = idleManager.subscribe();
    idleManager.unsubscribe(idleQueue);
    const iterator = idleQueue[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });

  test("closes stale subscribers before a new run starts", async () => {
    const manager = createPipelineManager({
      modeResolver: () => "synthetic",
      syntheticRunner: async ({ log }) => {
        log("PHASE: Demo");
      },
    });

    const staleQueue = manager.subscribe();
    await manager.startPipeline("https://one.example");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await manager.startPipeline("https://two.example");

    const seen: Array<string | null> = [];
    for await (const line of staleQueue) {
      seen.push(line);
      if (line === null) {
        break;
      }
    }

    expect(seen).toContain(null);
  });

  test("uses the default mode resolver for synthetic mode", async () => {
    const previousMode = process.env.PENTEST_PIPELINE_MODE;
    process.env.PENTEST_PIPELINE_MODE = "synthetic";
    const logs: string[] = [];

    try {
      const manager = createPipelineManager({
        syntheticRunner: async ({ log }) => {
          log("PHASE: Synthetic");
          logs.push("ran");
        },
      });
      await manager.startPipeline("https://default-mode.example");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(logs).toEqual(["ran"]);
    } finally {
      if (previousMode === undefined) {
        delete process.env.PENTEST_PIPELINE_MODE;
      } else {
        process.env.PENTEST_PIPELINE_MODE = previousMode;
      }
    }
  });

  test("uses the default mode resolver for real mode", async () => {
    const previousMode = process.env.PENTEST_PIPELINE_MODE;
    delete process.env.PENTEST_PIPELINE_MODE;
    const runs: string[] = [];

    try {
      const manager = createPipelineManager({
        realRunner: async ({ log }) => {
          log("PHASE: Real");
          runs.push("real");
        },
      });
      await manager.startPipeline("https://real-mode.example");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(runs).toEqual(["real"]);
    } finally {
      if (previousMode === undefined) {
        delete process.env.PENTEST_PIPELINE_MODE;
      } else {
        process.env.PENTEST_PIPELINE_MODE = previousMode;
      }
    }
  });
});

describe("synthetic pipeline credential branches", () => {
  test("logs supplied credentials and records an authenticated finding", async () => {
    const engagementDir = makeTempDir("eh-synth-creds-");
    const logs: string[] = [];

    await runSyntheticPipeline({
      target: "https://synthetic.example",
      engagement: "synthetic-example",
      engagementDir,
      username: "alice",
      password: "secret",
      log: (line) => logs.push(line),
    });

    const findingsCount = withReadOnlyDatabase(
      join(engagementDir, "pentest_data.db"),
      (db) => {
        const row = db
          .query(
            "SELECT COUNT(*) AS count FROM findings WHERE category = 'authentication' AND technique = 'interactive_login'",
          )
          .get() as { count: number };
        return row.count;
      },
    );

    expect(logs.filter((line) => line.startsWith("[creds]"))).toHaveLength(2);
    expect(findingsCount).toBe(1);
  });
});

describe("burp adapter failures", () => {
  test("times out waiting for Burp and cleans up the spawned process", async () => {
    const engagementDir = makeTempDir("eh-burp-timeout-");
    const logs: string[] = [];
    let killed = false;
    let now = 0;

    await expect(
      runBurpScan(
        "https://example.com",
        engagementDir,
        (line) => logs.push(line),
        {
          fetchFn: async () => {
            throw new Error("offline");
          },
          spawnFn: () => ({
            kill: () => {
              killed = true;
            },
            exited: Promise.resolve(0),
          }),
          sleepFn: async () => undefined,
          nowFn: () => {
            now += 10;
            return now;
          },
          startupTimeoutMs: 5,
        },
      ),
    ).rejects.toThrow("Burp Suite did not become ready within 5ms");

    expect(killed).toBe(true);
    expect(logs.at(-1)).toContain("Burp scan failed");
  });

  test("fails scan creation when Burp returns an error or no location header", async () => {
    const engagementDir = makeTempDir("eh-burp-create-");
    const process = {
      kill: () => undefined,
      exited: Promise.resolve(0),
    };

    await expect(
      runBurpScan("https://example.com", engagementDir, () => undefined, {
        fetchFn: (() => {
          const responses = [
            new Response("ok"),
            new Response("ok"),
            new Response(null, { status: 500 }),
          ];
          return () => Promise.resolve(responses.shift() as Response);
        })(),
        spawnFn: () => process,
        sleepFn: async () => undefined,
        readJsonFile: async <T>() => ({}) as T,
      }),
    ).rejects.toThrow("Burp scan creation failed with status 500");

    await expect(
      runBurpScan("https://example.com", engagementDir, () => undefined, {
        fetchFn: (() => {
          const responses = [
            new Response("ok"),
            new Response("ok"),
            new Response(null, { status: 201 }),
          ];
          return () => Promise.resolve(responses.shift() as Response);
        })(),
        spawnFn: () => process,
        sleepFn: async () => undefined,
        readJsonFile: async <T>() => ({}) as T,
      }),
    ).rejects.toThrow(
      "Burp scan creation response did not include a location header",
    );
  });

  test("warns on failed scans and rejects poll failures", async () => {
    const engagementDir = makeTempDir("eh-burp-poll-");
    const logs: string[] = [];

    await runBurpScan(
      "https://example.com",
      engagementDir,
      (line) => logs.push(line),
      {
        fetchFn: (() => {
          const responses = [
            new Response("ok"),
            new Response("ok"),
            new Response(null, {
              status: 201,
              headers: { location: "/scan/2" },
            }),
            new Response(JSON.stringify({ scan_status: "failed" }), {
              status: 200,
            }),
          ];
          return () => Promise.resolve(responses.shift() as Response);
        })(),
        spawnFn: () => ({
          kill: () => undefined,
          exited: Promise.resolve(0),
        }),
        sleepFn: async () => undefined,
        readJsonFile: async <T>() => ({}) as T,
      },
    );
    expect(logs).toContain(
      "WARNING: Burp scan reported failure. Continuing with partial results.",
    );

    await expect(
      runBurpScan("https://example.com", engagementDir, () => undefined, {
        fetchFn: (() => {
          const responses = [
            new Response("ok"),
            new Response("ok"),
            new Response(null, {
              status: 201,
              headers: { location: "/scan/3" },
            }),
            new Response(null, { status: 502 }),
          ];
          return () => Promise.resolve(responses.shift() as Response);
        })(),
        spawnFn: () => ({
          kill: () => undefined,
          exited: Promise.resolve(0),
        }),
        sleepFn: async () => undefined,
        readJsonFile: async <T>() => ({}) as T,
      }),
    ).rejects.toThrow("Burp scan poll failed with status 502");
  });

  test("uses default Bun helpers when dependencies are omitted", async () => {
    const engagementDir = makeTempDir("eh-burp-defaults-");
    const configPath = join(
      process.cwd(),
      "burp_headless_scanner",
      "deep.json",
    );
    expect(await Bun.file(configPath).json()).toBeDefined();

    const originalSpawn = Bun.spawn;
    const calls: Array<string[]> = [];
    Object.assign(Bun, {
      spawn: (options: { cmd: string[] }) => {
        calls.push(options.cmd);
        return {
          kill: () => undefined,
          exited: Promise.resolve(0),
        };
      },
    });

    try {
      await runBurpScan("https://example.com", engagementDir, () => undefined, {
        fetchFn: (() => {
          const responses = [
            new Response("ok"),
            new Response("ok"),
            new Response(null, {
              status: 201,
              headers: { location: "/scan/4" },
            }),
            new Response(JSON.stringify({ scan_status: "succeeded" }), {
              status: 200,
            }),
          ];
          return () => Promise.resolve(responses.shift() as Response);
        })(),
        sleepFn: async () => undefined,
      });
    } finally {
      Object.assign(Bun, { spawn: originalSpawn });
    }

    expect(calls).toHaveLength(2);
  });

  test("uses the default spawn wrapper for cleanup and multi-step polling", async () => {
    const engagementDir = makeTempDir("eh-burp-default-spawn-cleanup-");
    const originalSpawn = Bun.spawn;
    const originalServe = Bun.serve;
    const calls: Array<string[]> = [];
    let killCount = 0;
    const sleeps: number[] = [];

    Object.assign(Bun, {
      spawn: (options: { cmd: string[] }) => {
        calls.push(options.cmd);
        return {
          kill: () => {
            killCount += 1;
          },
          exited: Promise.resolve(0),
        };
      },
    });

    try {
      await expect(
        runBurpScan("https://example.com", engagementDir, () => undefined, {
          fetchFn: (() => {
            const responses = [
              new Response(null, { status: 503 }),
              new Response("ok", { status: 200 }),
              new Response("ok", { status: 200 }),
              new Response(null, {
                status: 201,
                headers: { location: "/scan/5" },
              }),
              new Response(JSON.stringify({ scan_status: "running" }), {
                status: 200,
              }),
              new Response(null, { status: 502 }),
            ];
            return () => Promise.resolve(responses.shift() as Response);
          })(),
          sleepFn: async (ms) => {
            sleeps.push(ms);
          },
          nowFn: (() => {
            let now = 0;
            return () => {
              now += 1;
              return now;
            };
          })(),
          startupTimeoutMs: 10,
          pollIntervalMs: 7,
        }),
      ).rejects.toThrow("Burp scan poll failed with status 502");
    } finally {
      Object.assign(Bun, { spawn: originalSpawn, serve: originalServe });
    }

    expect(calls).toHaveLength(2);
    expect(killCount).toBe(1);
    expect(sleeps).toContain(2_000);
    expect(sleeps).toContain(7);
  });
});

describe("claude adapter edge cases", () => {
  test("ignores non-text assistant blocks and logs stream errors", async () => {
    const logs: string[] = [];

    await expect(
      runClaudePhase({
        name: "Verification",
        prompt: "test",
        log: (line) => logs.push(line),
        dependencies: {
          queryFn: async function* () {
            yield {
              type: "assistant",
              message: {
                content: [
                  { type: "tool_use", name: "ignored" },
                  { type: "text", text: "  " },
                ],
              },
            };
            throw new Error("claude blew up");
          },
        },
      }),
    ).rejects.toThrow("claude blew up");

    expect(logs.at(-1)).toBe("Claude phase failed: claude blew up");
  });
});

describe("real pipeline branches", () => {
  test("runs all phases, composes prompts, ingests output, and shuts Burp down", async () => {
    const engagementDir = makeTempDir("eh-real-success-");
    const logs: string[] = [];
    const prompts: string[] = [];
    const ingests: Array<{ path: string; includeAll: boolean }> = [];
    let killed = false;
    const output = createSyntheticArtifacts(
      "https://real.example",
      "/tmp/recon.json",
    ).exploitation;

    await runRealPipeline(
      {
        target: "https://real.example",
        engagement: "real-example",
        engagementDir,
        username: "alice",
        password: "secret",
        log: (line) => logs.push(line),
      },
      {
        runBurpScanFn: async () => ({
          outputPath: "/tmp/burp.json",
          process: {
            kill: () => {
              killed = true;
            },
            exited: Promise.resolve(0),
          },
        }),
        runClaudePhaseFn: async ({ prompt }) => {
          prompts.push(prompt);
        },
        fileExistsFn: () => true,
        readJsonFile: async <T>() => output as T,
        ingestExploitationOutputFn: (_data, path, options) => {
          ingests.push({ path, includeAll: options?.includeAll ?? false });
          return 1;
        },
      },
    );

    expect(prompts).toHaveLength(3);
    expect(prompts.every((prompt) => prompt.includes("/tmp/burp.json"))).toBe(
      true,
    );
    expect(prompts[0]).toContain("Application credentials have been provided");
    expect(ingests).toEqual([
      {
        path: join(engagementDir, "pentest_data.db"),
        includeAll: true,
      },
    ]);
    expect(logs).toContain("  PIPELINE COMPLETE");
    expect(killed).toBe(true);
  });

  test("fails when exploitation output is missing and still shuts Burp down", async () => {
    const engagementDir = makeTempDir("eh-real-missing-");
    let killed = false;

    await expect(
      runRealPipeline(
        {
          target: "https://real.example",
          engagement: "real-example",
          engagementDir,
          log: () => undefined,
        },
        {
          runBurpScanFn: async () => ({
            outputPath: "/tmp/burp.json",
            process: {
              kill: () => {
                killed = true;
              },
              exited: Promise.resolve(0),
            },
          }),
          runClaudePhaseFn: async () => undefined,
          fileExistsFn: () => false,
        },
      ),
    ).rejects.toThrow(
      `Expected exploitation output at ${join(engagementDir, "exploitation_output.json")}`,
    );
    expect(killed).toBe(true);
  });

  test("logs ingestion warnings and propagates Claude failures", async () => {
    const engagementDir = makeTempDir("eh-real-errors-");
    const logs: string[] = [];
    let killCount = 0;
    const output = createSyntheticArtifacts(
      "https://real.example",
      "/tmp/recon.json",
    ).exploitation;

    await expect(
      runRealPipeline(
        {
          target: "https://real.example",
          engagement: "real-example",
          engagementDir,
          log: (line) => logs.push(line),
        },
        {
          runBurpScanFn: async () => ({
            outputPath: "/tmp/burp.json",
            process: {
              kill: () => {
                killCount += 1;
              },
              exited: Promise.resolve(0),
            },
          }),
          runClaudePhaseFn: async ({ name }) => {
            if (name === "Web Reconnaissance") {
              throw new Error("phase failed");
            }
          },
        },
      ),
    ).rejects.toThrow("phase failed");
    expect(killCount).toBe(1);

    await expect(
      runRealPipeline(
        {
          target: "https://real.example",
          engagement: "real-example",
          engagementDir,
          log: (line) => logs.push(line),
        },
        {
          runBurpScanFn: async () => ({
            outputPath: "/tmp/burp.json",
            process: {
              kill: () => {
                killCount += 1;
              },
              exited: Promise.resolve(0),
            },
          }),
          runClaudePhaseFn: async ({ prompt }) => {
            expect(prompt.includes("Application credentials")).toBe(false);
          },
          fileExistsFn: () => true,
          readJsonFile: async <T>() => output as T,
          ingestExploitationOutputFn: () => {
            throw new Error("db fail");
          },
        },
      ),
    ).rejects.toThrow("db fail");

    expect(logs).toContain("SQLite ingestion warning: db fail");
    expect(killCount).toBe(2);
  });

  test("uses the default JSON reader and SQLite ingestion when not overridden", async () => {
    const engagementDir = makeTempDir("eh-real-defaults-");
    const output = createSyntheticArtifacts(
      "https://real-defaults.example",
      join(engagementDir, "recon_output.json"),
    ).exploitation;
    await Bun.write(
      join(engagementDir, "exploitation_output.json"),
      JSON.stringify(output, null, 2),
    );

    await runRealPipeline(
      {
        target: "https://real-defaults.example",
        engagement: "real-defaults-example",
        engagementDir,
        log: () => undefined,
      },
      {
        runBurpScanFn: async () => ({
          outputPath: "/tmp/burp.json",
          process: {
            kill: () => undefined,
            exited: Promise.resolve(0),
          },
        }),
        runClaudePhaseFn: async () => undefined,
        fileExistsFn: () => true,
      },
    );

    const count = withReadOnlyDatabase(
      join(engagementDir, "pentest_data.db"),
      (db) => {
        const row = db
          .query("SELECT COUNT(*) AS count FROM engagements")
          .get() as { count: number };
        return row.count;
      },
    );
    expect(count).toBe(1);
  });
});
