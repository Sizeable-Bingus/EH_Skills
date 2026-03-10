import { existsSync } from "node:fs";
import { join } from "node:path";

import { ingestExploitationOutput } from "../db/ingest.ts";
import type { ExploitationOutput } from "../types.ts";
import { getErrorMessage, phaseHeader } from "../utils.ts";
import { runBurpScan } from "./burp.ts";
import { runClaudePhase } from "./claude.ts";
import type {
  ClaudePhaseDependencies,
  PipelineExecutionContext
} from "./types.ts";

export async function runRealPipeline(
  context: PipelineExecutionContext,
  dependencies: ClaudePhaseDependencies = {}
): Promise<void> {
  const reconPath = join(context.engagementDir, "recon_output.json");
  const exploitationPath = join(
    context.engagementDir,
    "exploitation_output.json"
  );
  const dbPath = join(context.engagementDir, "pentest_data.db");

  for (const line of phaseHeader("Burp Suite Scan")) {
    context.log(line);
  }

  const burp = await runBurpScan(
    context.target,
    context.engagementDir,
    context.log
  );
  const credentialsText =
    context.username || context.password
      ? ` Application credentials have been provided — username: ${
          context.username ?? "(none)"
        }, password: ${context.password ?? "(none)"}. Use these credentials to authenticate and test behind login walls.`
      : "";

  try {
    await runClaudePhase({
      name: "Web Reconnaissance",
      prompt: [
        `Use the web-recon skill to perform thorough enumeration of the target web application at ${context.target}.`,
        `Write the recon artifact to ${reconPath}.`,
        `Burp Suite scan results are available at ${burp.outputPath} and must be incorporated into the recon.${credentialsText}`
      ].join(" "),
      log: context.log,
      dependencies
    });

    await runClaudePhase({
      name: "Recon Verification",
      prompt: [
        `Use the web-recon skill to verify that the recon artifact stored at ${reconPath} did not miss anything.`,
        `Update ${reconPath} in place with any corrections or additions.`,
        `Burp Suite scan results are also available at ${burp.outputPath}.${credentialsText}`
      ].join(" "),
      log: context.log,
      dependencies
    });

    await runClaudePhase({
      name: "Web Exploitation",
      prompt: [
        `/web-exploitation Perform web exploitation against ${context.target}.`,
        `Recon data is at ${reconPath}.`,
        `This is an authorized penetration test.`,
        `Write output to ${exploitationPath}.`,
        `Do not write to SQLite directly; the application will ingest the JSON after the phase completes.`,
        `Burp Suite scan results are at ${burp.outputPath}.${credentialsText}`
      ].join(" "),
      log: context.log,
      dependencies
    });

    if (!existsSync(exploitationPath)) {
      throw new Error(`Expected exploitation output at ${exploitationPath}`);
    }

    const exploitation = (await Bun.file(
      exploitationPath
    ).json()) as ExploitationOutput;
    try {
      ingestExploitationOutput(exploitation, dbPath, { includeAll: true });
    } catch (error) {
      context.log(`SQLite ingestion warning: ${getErrorMessage(error)}`);
      throw error;
    }

    context.log("");
    context.log(`${"=".repeat(60)}`);
    context.log("  PIPELINE COMPLETE");
    context.log(`${"=".repeat(60)}`);
    context.log(`Results: ${context.engagementDir}/`);
  } finally {
    context.log("Shutting down Burp Suite...");
    burp.process.kill();
    await burp.process.exited.catch(() => undefined);
  }
}
