import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { ENGAGEMENTS_DIR } from "../constants.ts";
import type { PipelineState } from "../types.ts";
import { getErrorMessage, sanitizeTarget } from "../utils.ts";
import { runRealPipeline } from "./real.ts";
import { runSyntheticPipeline } from "./synthetic.ts";
import type { PipelineRunner } from "./types.ts";

class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private resolvers: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  constructor() {}

  push(item: T): void {
    if (this.closed) {
      return;
    }
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value: item, done: false });
      return;
    }
    this.items.push(item);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift();
      resolver?.({ value: undefined as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) {
          const value = this.items.shift() as T;
          return Promise.resolve({ value, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as T, done: true });
        }
        const deferred = Promise.withResolvers<IteratorResult<T>>();
        this.resolvers.push(deferred.resolve);
        return deferred.promise;
      }
    };
  }
}

export interface PipelineManagerOptions {
  engagementsDir?: string;
  modeResolver?: () => "real" | "synthetic";
  realRunner?: PipelineRunner;
  syntheticRunner?: PipelineRunner;
}

export function createPipelineManager(options: PipelineManagerOptions = {}) {
  const state: PipelineState = {
    status: "idle",
    target: "",
    engagement: "",
    currentPhase: "",
    logLines: []
  };
  const subscribers = new Set<AsyncQueue<string | null>>();
  const engagementsDir = options.engagementsDir ?? ENGAGEMENTS_DIR;
  const modeResolver = options.modeResolver;
  const realRunner = options.realRunner ?? runRealPipeline;
  const syntheticRunner = options.syntheticRunner ?? runSyntheticPipeline;

  function log(line: string): void {
    state.logLines.push(line);
    const match = line.match(/PHASE:\s*(.+)/);
    if (match) {
      state.currentPhase = match[1]?.trim() ?? state.currentPhase;
    }
    for (const queue of subscribers) {
      queue.push(line);
    }
  }

  function startPipeline(
    target: string,
    username?: string,
    password?: string
  ): Promise<PipelineState> {
    if (state.status === "running") {
      return Promise.reject(new Error("Pipeline already running"));
    }

    let mode: "real" | "synthetic";
    if (modeResolver) {
      mode = modeResolver();
    } else {
      const configuredMode =
        process.env.PENTEST_PIPELINE_MODE?.trim().toLowerCase();
      if (!configuredMode || configuredMode === "real") {
        mode = "real";
      } else if (configuredMode === "synthetic") {
        mode = "synthetic";
      } else {
        throw new Error(
          `Unsupported pipeline mode: ${configuredMode}. Expected "real" or "synthetic".`
        );
      }
    }
    let runner: PipelineRunner;
    switch (mode) {
      case "synthetic":
        runner = syntheticRunner;
        break;
      case "real":
        runner = realRunner;
        break;
      default:
        throw new Error(
          `Unsupported pipeline mode: ${String(mode)}. Expected "real" or "synthetic".`
        );
    }

    for (const queue of subscribers) {
      queue.push(null);
      queue.close();
    }
    subscribers.clear();

    state.status = "running";
    state.target = target;
    state.engagement = sanitizeTarget(target);
    state.currentPhase = "Starting";
    state.logLines = [];

    const engagementDir = join(engagementsDir, state.engagement);
    mkdirSync(engagementDir, { recursive: true });

    async function executePipeline(): Promise<void> {
      try {
        await runner({
          target,
          engagement: state.engagement,
          engagementDir,
          username,
          password,
          log
        });
        state.status = "complete";
        state.currentPhase = "Complete";
      } catch (error) {
        state.status = "error";
        state.currentPhase = `Error: ${getErrorMessage(error)}`;
        log(`ERROR: ${getErrorMessage(error)}`);
      } finally {
        for (const queue of subscribers) {
          queue.push(null);
        }
      }
    }

    void executePipeline();

    return Promise.resolve(state);
  }

  function subscribe(): AsyncQueue<string | null> {
    const queue = new AsyncQueue<string | null>();
    for (const line of state.logLines) {
      queue.push(line);
    }
    if (state.status === "complete" || state.status === "error") {
      queue.push(null);
    } else {
      subscribers.add(queue);
    }
    return queue;
  }

  function unsubscribe(queue: AsyncQueue<string | null>): void {
    subscribers.delete(queue);
    queue.close();
  }

  return {
    getState(): PipelineState {
      return state;
    },
    startPipeline,
    subscribe,
    unsubscribe
  };
}
