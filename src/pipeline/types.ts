import type { ExploitationOutput } from "../types.ts";

export interface PipelineExecutionContext {
  target: string;
  engagement: string;
  engagementDir: string;
  username?: string | undefined;
  password?: string | undefined;
  log: (line: string) => void;
}

export type PipelineRunner = (
  context: PipelineExecutionContext
) => Promise<void>;

export interface ClaudePhaseDependencies {
  queryFn?: (params: {
    prompt: string;
    options?: Record<string, unknown>;
  }) => AsyncIterable<unknown>;
}

export interface BurpScanResult {
  process: BurpProcessLike;
  outputPath: string;
}

export interface BurpProcessLike {
  kill: () => void;
  exited: Promise<number>;
}

export interface BurpDependencies {
  fetchFn?: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
  spawnFn?: (options: {
    cmd: string[];
    stdout?: "ignore" | "pipe";
    stderr?: "ignore" | "pipe";
  }) => BurpProcessLike;
  sleepFn?: (ms: number) => Promise<void>;
  readJsonFile?: <T>(path: string) => Promise<T>;
  nowFn?: () => number;
  pollIntervalMs?: number;
  startupTimeoutMs?: number;
}

export interface SyntheticArtifacts {
  recon: Record<string, unknown>;
  exploitation: ExploitationOutput;
}

export interface RealPipelineDependencies extends ClaudePhaseDependencies {
  runBurpScanFn?: (
    target: string,
    engagementDir: string,
    log: (line: string) => void
  ) => Promise<BurpScanResult>;
  runClaudePhaseFn?: (options: {
    name: string;
    prompt: string;
    log: (line: string) => void;
    dependencies?: ClaudePhaseDependencies;
  }) => Promise<void>;
  fileExistsFn?: (path: string) => boolean;
  readJsonFile?: <T>(path: string) => Promise<T>;
  ingestExploitationOutputFn?: (
    data: ExploitationOutput,
    dbPath: string,
    options?: { force?: boolean; includeAll?: boolean }
  ) => number;
}
