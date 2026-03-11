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
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
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
  const modeResolver = options.modeResolver ?? defaultModeResolver;
  const realRunner = options.realRunner ?? runRealPipeline;
  const syntheticRunner = options.syntheticRunner ?? runSyntheticPipeline;

  function broadcast(line: string | null): void {
    for (const queue of subscribers) {
      queue.push(line);
    }
  }

  function log(line: string): void {
    state.logLines.push(line);
    const match = line.match(/PHASE:\s*(.+)/);
    if (match) {
      state.currentPhase = match[1]?.trim() ?? state.currentPhase;
    }
    broadcast(line);
  }

  function startPipeline(
    target: string,
    username?: string,
    password?: string
  ): Promise<PipelineState> {
    if (state.status === "running") {
      return Promise.reject(new Error("Pipeline already running"));
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

    const runner =
      modeResolver() === "synthetic" ? syntheticRunner : realRunner;

    void (async () => {
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
        broadcast(null);
      }
    })();

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

function defaultModeResolver(): "real" | "synthetic" {
  return process.env.PENTEST_PIPELINE_MODE?.trim().toLowerCase() === "synthetic"
    ? "synthetic"
    : "real";
}
