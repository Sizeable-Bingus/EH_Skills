import { query } from "@anthropic-ai/claude-agent-sdk";

import { BURP_MCP_SSE, PROJECT_ROOT } from "../constants.ts";
import { getErrorMessage, phaseHeader } from "../utils.ts";
import type { ClaudePhaseDependencies } from "./types.ts";

interface RunClaudePhaseOptions {
  name: string;
  prompt: string;
  log: (line: string) => void;
  dependencies?: ClaudePhaseDependencies;
}

export async function runClaudePhase(
  options: RunClaudePhaseOptions
): Promise<void> {
  const queryFn = options.dependencies?.queryFn ?? query;
  for (const line of phaseHeader(options.name)) {
    options.log(line);
  }

  const model = process.env.PENTEST_CLAUDE_MODEL;
  const messageStream = queryFn({
    prompt: options.prompt,
    options: {
      cwd: PROJECT_ROOT,
      tools: { type: "preset", preset: "claude_code" },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      settingSources: ["project"],
      systemPrompt: { type: "preset", preset: "claude_code" },
      mcpServers: {
        burp: {
          type: "sse",
          url: BURP_MCP_SSE
        }
      },
      ...(model ? { model } : {})
    }
  });

  try {
    for await (const message of messageStream) {
      if (isAssistantMessage(message)) {
        for (const block of message.message.content) {
          if (isTextBlock(block) && block.text.trim().length > 0) {
            options.log(block.text);
          }
        }
      } else if (isResultMessage(message)) {
        options.log(`--- ${options.name} complete ---`);
      }
    }
  } catch (error) {
    options.log(`Claude phase failed: ${getErrorMessage(error)}`);
    throw error;
  }
}

function isAssistantMessage(
  message: unknown
): message is { type: "assistant"; message: { content: unknown[] } } {
  const candidate = message as {
    type?: string;
    message?: { content?: unknown };
  } | null;
  return (
    candidate?.type === "assistant" && Array.isArray(candidate.message?.content)
  );
}

function isResultMessage(message: unknown): message is { type: "result" } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: string }).type === "result"
  );
}

function isTextBlock(block: unknown): block is { type: "text"; text: string } {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    "text" in block &&
    block.type === "text" &&
    typeof block.text === "string"
  );
}
