/** @jsxImportSource hono/jsx */
import { rmSync } from "node:fs";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";

import {
  DIST_PUBLIC_DIR,
  ENGAGEMENTS_DIR,
  SECURITY_HEADERS
} from "./constants.ts";
import {
  deleteEngagementDirectory,
  getChainsPage,
  getFindingsPage,
  getLootPage,
  getSummaryPage,
  listEngagements,
  resolveEngagementDb
} from "./db/dashboard.ts";
import { SummaryPage } from "./pages/summary.tsx";
import { FindingsPage } from "./pages/findings.tsx";
import { ChainsPage } from "./pages/chains.tsx";
import { LootPage } from "./pages/loot.tsx";
import type { StartPipelineRequest } from "./types.ts";
import { buildClientAssets } from "./build.ts";
import { createPipelineManager } from "./pipeline/manager.ts";

export interface AppOptions {
  engagementsDir?: string;
  assetRoot?: string;
  pipelineManager?: ReturnType<typeof createPipelineManager>;
}

export function createApp(options: AppOptions = {}): Hono {
  const engagementsDir = options.engagementsDir ?? ENGAGEMENTS_DIR;
  const assetRoot = options.assetRoot ?? DIST_PUBLIC_DIR;
  const pipelineManager = options.pipelineManager ?? createPipelineManager();

  const app = new Hono();

  app.use(
    "/static/*",
    serveStatic({
      root: assetRoot,
      rewriteRequestPath: (path) => path.replace(/^\/static\//, "/")
    })
  );
  app.use(async (c, next) => {
    await next();
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      c.res.headers.set(header, value);
    }
  });

  app.get("/", (c) => {
    const currentEngagement = c.req.query("engagement") ?? "";
    const resolved = resolveEngagementDb(currentEngagement);
    return c.html(
      <SummaryPage
        model={getSummaryPage(resolved.dbPath, resolved.engagementId)}
        currentEngagement={currentEngagement}
      />
    );
  });

  app.get("/findings", (c) => {
    const currentEngagement = c.req.query("engagement") ?? "";
    const resolved = resolveEngagementDb(currentEngagement);
    return c.html(
      <FindingsPage
        model={getFindingsPage(resolved.dbPath, resolved.engagementId, {
          severity: c.req.query("severity") ?? null,
          category: c.req.query("category") ?? null
        })}
        currentEngagement={currentEngagement}
      />
    );
  });

  app.get("/chains", (c) => {
    const currentEngagement = c.req.query("engagement") ?? "";
    const resolved = resolveEngagementDb(currentEngagement);
    return c.html(
      <ChainsPage
        model={getChainsPage(resolved.dbPath, resolved.engagementId)}
        currentEngagement={currentEngagement}
      />
    );
  });

  app.get("/loot", (c) => {
    const currentEngagement = c.req.query("engagement") ?? "";
    const resolved = resolveEngagementDb(currentEngagement);
    return c.html(
      <LootPage
        model={getLootPage(resolved.dbPath, resolved.engagementId)}
        currentEngagement={currentEngagement}
      />
    );
  });

  app.post("/api/pipeline/start", async (c) => {
    const body = await c.req.json<StartPipelineRequest>();
    if (!body.target) {
      return c.json({ detail: "Target is required" }, 400);
    }

    try {
      await pipelineManager.startPipeline(
        body.target,
        body.username,
        body.password
      );
      return c.json({ status: "started", target: body.target });
    } catch (error) {
      return c.json(
        { detail: error instanceof Error ? error.message : String(error) },
        409
      );
    }
  });

  app.get("/api/pipeline/status", (c) => {
    const state = pipelineManager.getState();
    return c.json({
      status: state.status,
      target: state.target,
      current_phase: state.currentPhase,
      line_count: state.logLines.length
    });
  });

  app.get("/api/pipeline/stream", (c) => {
    const queue = pipelineManager.subscribe();
    return streamSSE(c, async (stream) => {
      try {
        for await (const line of queue) {
          if (line === null) {
            const state = pipelineManager.getState();
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify({
                status: state.status,
                current_phase: state.currentPhase,
                target: state.target
              })
            });
            break;
          }
          await stream.writeSSE({ data: line });
        }
      } finally {
        pipelineManager.unsubscribe(queue);
      }
    });
  });

  app.get("/api/engagements", (c) => {
    return c.json(listEngagements(engagementsDir));
  });

  app.delete("/api/engagements/:name", (c) => {
    const name = c.req.param("name");
    const state = pipelineManager.getState();
    if (state.status === "running" && state.engagement === name) {
      return c.json(
        { detail: "Cannot delete while pipeline is running for this target" },
        409
      );
    }

    try {
      const directory = deleteEngagementDirectory(name, engagementsDir);
      rmSync(directory, { recursive: true, force: true });
      return c.json({ status: "deleted", engagement: name });
    } catch (error) {
      return c.json(
        { detail: error instanceof Error ? error.message : String(error) },
        404
      );
    }
  });

  return app;
}

const app = createApp();

if (import.meta.main) {
  if (!process.env.PENTEST_SKIP_ASSET_BUILD) {
    await buildClientAssets();
  }

  const port = Number(process.env.PORT ?? 8000);
  Bun.serve({
    fetch: app.fetch,
    port,
    hostname: "0.0.0.0"
  });
  // Keep the startup line explicit for local operators.
  console.log(`Pentest dashboard listening on http://0.0.0.0:${port}`);
}

export default app;
