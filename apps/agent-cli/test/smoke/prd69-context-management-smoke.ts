import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { StaticPromptSource } from "../../src/prompt/types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const PROMPT_SOURCE: StaticPromptSource = {
  core: "prd69-system",
  tools: [],
  skills: [],
  rules: [],
};

async function withWorkspace<T>(fn: () => Promise<T>): Promise<T> {
  const workspace = await mkdtemp(path.join(tmpdir(), "prd69-context-"));
  const previousCwd = process.cwd();
  try {
    process.chdir(workspace);
    return await fn();
  } finally {
    process.chdir(previousCwd);
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

function createClient(seenRequests: Array<{ messages: ChatCompletionMessageParam[]; max_tokens?: number }>): OpenAI {
  return {
    chat: {
      completions: {
        create: async (request: { messages: ChatCompletionMessageParam[]; max_tokens?: number }) => {
          seenRequests.push(request);
          return {
            choices: [{ finish_reason: "stop", message: { role: "assistant", content: "prd69 ok" } }],
            usage: { completion_tokens: 1 },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

async function main(): Promise<void> {
  process.env.AGENT_COMPACT_THRESHOLD_TOKENS = "400";
  process.env.AGENT_COMPACT_DEFAULT_KEEP_RECENT = "1";
  process.env.AGENT_COMPACT_MIN_REDUCTION_TOKENS = "10";
  process.env.AGENT_MODEL_MAX_COMPLETION_TOKENS = "1234";

  const { agentLoop } = await import("../../src/agent-loop.js");

  await withWorkspace(async () => {
    const seenRequests: Array<{ messages: ChatCompletionMessageParam[]; max_tokens?: number }> = [];
    const messages: ChatCompletionMessageParam[] = [
      { role: "user", content: "x".repeat(500) },
      { role: "assistant", content: "y".repeat(500) },
      { role: "user", content: "final prompt" },
    ];

    await agentLoop({
      client: createClient(seenRequests),
      model: "prd69-model",
      promptSource: PROMPT_SOURCE,
      tools: [] as ChatCompletionTool[],
      messages,
      runtimeState: {
        sessionId: "prd69-session",
        roundsWithoutTodo: 0,
        activeTaskId: 69,
        lastMemoryInput: null,
        roundCounter: 3,
        touchedPaths: new Set(["apps/agent-cli/src/runtime/query-model.ts"]),
        wroteWorkspaceFiles: true,
      },
    });

    assert(seenRequests.length === 1, "context should compact before the first model request");
    assert(seenRequests[0]?.max_tokens === 1234, "model request should use configured max_tokens");
    const compacted = seenRequests[0]?.messages.find(
      (message) =>
        message.role === "assistant" &&
        typeof message.content === "string" &&
        message.content.startsWith("Context compacted (auto)."),
    );
    assert(compacted, "request should include compacted assistant context");
    assert(String(compacted.content).includes("Runtime state restored after compaction"), "compact should restore runtime state");
    assert(String(compacted.content).includes("activeTaskId: 69"), "compact state should include active task");
    assert(String(compacted.content).includes("roundCounter:"), "compact state should include current round");
  });

  console.log("PRD69_CONTEXT_MANAGEMENT_SMOKE_OK");
}

main().catch((error) => {
  console.error("PRD69_CONTEXT_MANAGEMENT_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
