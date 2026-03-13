import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  BURP_JAR,
  BURP_JAVA,
  BURP_MCP_SSE,
  BURP_POLL_INTERVAL_MS,
  BURP_REST_API,
  BURP_SCAN_CONFIG,
  BURP_STARTUP_TIMEOUT_MS,
} from "../constants.ts";
import { getErrorMessage, sleep } from "../utils.ts";
import type {
  BurpDependencies,
  BurpProcessLike,
  BurpScanResult,
} from "./types.ts";

export async function runBurpScan(
  target: string,
  engagementDir: string,
  log: (line: string) => void,
  dependencies: BurpDependencies = {},
): Promise<BurpScanResult> {
  const fetchFn = dependencies.fetchFn ?? fetch;
  const spawnFn = dependencies.spawnFn ?? defaultSpawn;
  const sleepFn = dependencies.sleepFn ?? sleep;
  const readJsonFile = dependencies.readJsonFile ?? readJsonViaBun;
  const nowFn = dependencies.nowFn ?? Date.now;
  const pollIntervalMs = dependencies.pollIntervalMs ?? BURP_POLL_INTERVAL_MS;
  const startupTimeoutMs =
    dependencies.startupTimeoutMs ?? BURP_STARTUP_TIMEOUT_MS;

  await killStaleBurp(spawnFn, sleepFn);
  const process = spawnFn({
    cmd: [
      BURP_JAVA,
      "-Djava.awt.headless=true",
      "-jar",
      BURP_JAR,
      "--unpause-spider-and-scanner",
    ],
    stdout: "ignore",
    stderr: "ignore",
  });

  try {
    log("Starting Burp Suite headless...");
    await waitForBurp(
      fetchFn,
      sleepFn,
      log,
      nowFn,
      startupTimeoutMs,
      pollIntervalMs,
    );
    const scanId = await createBurpScan(target, fetchFn, readJsonFile, log);
    const scanData = await pollScan(
      scanId,
      fetchFn,
      sleepFn,
      log,
      pollIntervalMs,
    );

    mkdirSync(engagementDir, { recursive: true });
    const outputPath = join(engagementDir, "burp_scan.json");
    await Bun.write(outputPath, JSON.stringify(scanData, null, 2));
    log(`Burp scan results saved to ${outputPath}`);

    if (scanData.scan_status === "failed") {
      log(
        "WARNING: Burp scan reported failure. Continuing with partial results.",
      );
    }

    return { process, outputPath };
  } catch (error) {
    process.kill();
    try {
      await process.exited;
    } catch {
      // Ignore shutdown errors after a scan failure.
    }
    log(`Burp scan failed: ${getErrorMessage(error)}`);
    throw error;
  }
}

async function killStaleBurp(
  spawnFn: (options: {
    cmd: string[];
    stdout?: "ignore" | "pipe";
    stderr?: "ignore" | "pipe";
  }) => BurpProcessLike,
  sleepFn: (ms: number) => Promise<void>,
): Promise<void> {
  const process = spawnFn({
    cmd: ["pkill", "-f", "burpsuite_pro.jar"],
    stdout: "ignore",
    stderr: "ignore",
  });
  try {
    await process.exited;
  } catch {
    // Ignore stale-process shutdown errors.
  }
  await sleepFn(2_000);
}

async function waitForBurp(
  fetchFn: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
  sleepFn: (ms: number) => Promise<void>,
  log: (line: string) => void,
  nowFn: () => number,
  startupTimeoutMs: number,
  pollIntervalMs: number,
): Promise<void> {
  const start = nowFn();
  let restReady = false;
  let mcpReady = false;

  while (nowFn() - start < startupTimeoutMs) {
    if (!restReady) {
      try {
        const response = await fetchFn(`${BURP_REST_API}/`, {
          signal: AbortSignal.timeout(3_000),
        });
        if (response.status < 500) {
          restReady = true;
          log("  Burp REST API ready");
        }
      } catch {
        // Retry until timeout.
      }
    }

    if (!mcpReady) {
      try {
        const response = await fetchFn(BURP_MCP_SSE, {
          signal: AbortSignal.timeout(3_000),
        });
        await response.body?.cancel();
        mcpReady = true;
        log("  Burp MCP SSE ready");
      } catch {
        // Retry until timeout.
      }
    }

    if (restReady && mcpReady) {
      log("Burp Suite is ready.");
      return;
    }

    await sleepFn(pollIntervalMs);
  }

  throw new Error(
    `Burp Suite did not become ready within ${startupTimeoutMs}ms`,
  );
}

async function createBurpScan(
  target: string,
  fetchFn: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
  readJsonFile: <T>(path: string) => Promise<T>,
  log: (line: string) => void,
): Promise<string> {
  const config = await readJsonFile<Record<string, unknown>>(BURP_SCAN_CONFIG);
  const response = await fetchFn(`${BURP_REST_API}/v0.1/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scan_configurations: [
        { config: JSON.stringify(config), type: "CustomConfiguration" },
      ],
      urls: [target],
    }),
  });

  if (!response.ok) {
    throw new Error(`Burp scan creation failed with status ${response.status}`);
  }

  const scanId = response.headers.get("location");
  if (!scanId) {
    throw new Error(
      "Burp scan creation response did not include a location header",
    );
  }

  log(`Burp scan created with ID: ${scanId}`);
  return scanId;
}

async function pollScan(
  scanId: string,
  fetchFn: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
  sleepFn: (ms: number) => Promise<void>,
  log: (line: string) => void,
  pollIntervalMs: number,
): Promise<Record<string, unknown>> {
  log("Polling Burp scan status...");

  let finalScanData: Record<string, unknown> | null = null;
  while (finalScanData === null) {
    const response = await fetchFn(`${BURP_REST_API}/v0.1/scan/${scanId}`);
    if (!response.ok) {
      throw new Error(`Burp scan poll failed with status ${response.status}`);
    }

    const scanData = (await response.json()) as Record<string, unknown>;
    const status =
      typeof scanData.scan_status === "string"
        ? scanData.scan_status
        : "unknown";
    log(`  Scan status: ${status}`);
    if (status === "succeeded" || status === "failed") {
      finalScanData = scanData;
      continue;
    }

    await sleepFn(pollIntervalMs);
  }

  return finalScanData;
}

function defaultSpawn(options: {
  cmd: string[];
  stdout?: "ignore" | "pipe";
  stderr?: "ignore" | "pipe";
}): BurpProcessLike {
  const subprocess = Bun.spawn({
    cmd: options.cmd,
    stdout: options.stdout ?? "ignore",
    stderr: options.stderr ?? "ignore",
  });

  return {
    kill: () => {
      subprocess.kill();
    },
    exited: subprocess.exited,
  };
}

async function readJsonViaBun<T>(path: string): Promise<T> {
  return (await Bun.file(path).json()) as T;
}
