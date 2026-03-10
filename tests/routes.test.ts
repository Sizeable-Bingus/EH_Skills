import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createPipelineManager } from "../src/pipeline/manager.ts";
import { createApp } from "../src/server.tsx";

const fixtureDb = join(
  process.cwd(),
  "engagements",
  "example-com",
  "pentest_data.db"
);

describe("route responses", () => {
  test("renders all four dashboard pages", async () => {
    const app = createApp();

    const summary = await app.request("/");
    const findings = await app.request("/findings?engagement=example-com");
    const chains = await app.request("/chains?engagement=example-com");
    const loot = await app.request("/loot?engagement=example-com");

    expect(summary.status).toBe(200);
    expect(await summary.text()).toContain("Executive Summary");
    expect(findings.status).toBe(200);
    expect(await findings.text()).toContain("Findings");
    expect(chains.status).toBe(200);
    expect(await chains.text()).toContain("Attack Chains");
    expect(loot.status).toBe(200);
    expect(await loot.text()).toContain("Compromised Credentials");
  });

  test("serves built static assets under /static", async () => {
    const app = createApp();
    const response = await app.request("/static/styles.css");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
    expect(await response.text()).toContain(":root");
  });
});

describe("engagement APIs", () => {
  let engagementRoot: string;

  beforeEach(() => {
    engagementRoot = mkdtempSync(join(tmpdir(), "eh-skills-routes-"));
    mkdirSync(join(engagementRoot, "demo"), { recursive: true });
    cpSync(fixtureDb, join(engagementRoot, "demo", "pentest_data.db"));
  });

  afterEach(() => {
    rmSync(engagementRoot, { recursive: true, force: true });
  });

  test("lists valid engagements only", async () => {
    mkdirSync(join(engagementRoot, "empty-dir"), { recursive: true });

    const app = createApp({ engagementsDir: engagementRoot });
    const response = await app.request("/api/engagements");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(["demo"]);
  });

  test("blocks deleting the running engagement", async () => {
    const manager = createPipelineManager({
      modeResolver: () => "synthetic",
      syntheticRunner: async ({ log }) => {
        log("PHASE: Demo");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });
    await manager.startPipeline("https://demo");

    const app = createApp({
      engagementsDir: engagementRoot,
      pipelineManager: manager
    });
    const response = await app.request("/api/engagements/demo", {
      method: "DELETE"
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      detail: "Cannot delete while pipeline is running for this target"
    });
  });

  test("deletes a completed engagement directory", async () => {
    const app = createApp({
      engagementsDir: engagementRoot,
      pipelineManager: createPipelineManager({
        modeResolver: () => "synthetic",
        syntheticRunner: () => Promise.resolve()
      })
    });

    const response = await app.request("/api/engagements/demo", {
      method: "DELETE"
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "deleted",
      engagement: "demo"
    });
  });
});
