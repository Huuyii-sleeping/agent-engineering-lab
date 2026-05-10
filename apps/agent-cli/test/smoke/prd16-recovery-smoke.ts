import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { StaticPromptSource } from "../../src/prompt/types.js";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createRuntimeState() {
  return {
    sessionId: "session_prd16_smoke",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
  };
}

const PROMPT_SOURCE: StaticPromptSource = {
  core: "smoke-system",
  tools: [],
  skills: [],
  rules: [],
};

async function withWorkspace<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const workspace = await mkdtemp(path.join(tmpdir(), `${name}-`));
  const previousCwd = process.cwd();
  try {
    process.chdir(workspace);
    return await fn();
  } finally {
    process.chdir(previousCwd);
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

function buildClient(
  handler: (request: { messages: ChatCompletionMessageParam[] }, callCount: number) => Promise<unknown>,
): OpenAI {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: async (request: { messages: ChatCompletionMessageParam[] }) => {
          callCount += 1;
          return handler(request, callCount);
        },
      },
    },
  } as unknown as OpenAI;
}

async function main(): Promise<void> {
  process.env.AGENT_RECOVERY_BACKOFF_BASE_MS = "1";
  process.env.AGENT_RECOVERY_BACKOFF_MAX_MS = "2";
  process.env.AGENT_RECOVERY_CONTINUATION_MAX_ATTEMPTS = "2";
  process.env.AGENT_RECOVERY_COMPACT_MAX_ATTEMPTS = "2";
  process.env.AGENT_RECOVERY_TRANSPORT_MAX_ATTEMPTS = "2";
  process.env.AGENT_COMPACT_THRESHOLD_TOKENS = "200";
  process.env.AGENT_COMPACT_DEFAULT_KEEP_RECENT = "1";

  const { agentLoop } = await import("../../src/agent-loop.js");

  await withWorkspace("prd16-continue", async () => {
    const seenRequests: ChatCompletionMessageParam[][] = [];
    const client = buildClient(async (request, callCount) => {
      seenRequests.push(request.messages);
      if (callCount === 1) {
        return {
          choices: [
            {
              finish_reason: "length",
              message: {
                role: "assistant",
                content: "Part A",
              },
            },
          ],
          usage: { completion_tokens: 1 },
        };
      }
      return {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: " and part B",
            },
          },
        ],
        usage: { completion_tokens: 1 },
      };
    });

    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "continue smoke" }];
    await agentLoop({
      client,
      model: "smoke-model",
      promptSource: PROMPT_SOURCE,
      tools: [] as ChatCompletionTool[],
      messages,
      runtimeState: createRuntimeState(),
    });

    assert(seenRequests.length === 2, "continuation scenario should make two model requests");
    const secondRequest = seenRequests[1] ?? [];
    assert(
      secondRequest.some((item) => item.role === "assistant" && item.content === "Part A"),
      "continuation scenario should include the partial assistant answer in the retry request",
    );
    assert(
      secondRequest.some(
        (item) => item.role === "user" && typeof item.content === "string" && item.content.includes("Do not repeat prior text"),
      ),
      "continuation scenario should inject a continue prompt",
    );
    const finalMessage = messages[messages.length - 1];
    assert(finalMessage?.role === "assistant" && finalMessage.content === "Part A and part B", "continuation should merge final output");
  });

  await withWorkspace("prd16-compact", async () => {
    const seenRequests: ChatCompletionMessageParam[][] = [];
    const client = buildClient(async (request) => {
      seenRequests.push(request.messages);
      return {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "compact ok",
            },
          },
        ],
        usage: { completion_tokens: 1 },
      };
    });

    const largeChunk = "x".repeat(180);
    const messages: ChatCompletionMessageParam[] = [
      { role: "user", content: largeChunk },
      { role: "assistant", content: largeChunk },
      { role: "user", content: "final compact smoke prompt" },
    ];
    await agentLoop({
      client,
      model: "smoke-model",
      promptSource: PROMPT_SOURCE,
      tools: [] as ChatCompletionTool[],
      messages,
      runtimeState: createRuntimeState(),
    });

    assert(seenRequests.length === 1, "compact scenario should retry internally before the first successful request");
    assert(
      seenRequests[0]?.some(
        (item) =>
          item.role === "assistant" &&
          typeof item.content === "string" &&
          item.content.startsWith("Context compacted (auto)."),
      ),
      "compact scenario should send a compacted summary into the model request",
    );
  });

  await withWorkspace("prd16-backoff", async () => {
    const client = buildClient(async (_request, callCount) => {
      if (callCount === 1) {
        throw Object.assign(new Error("Too many requests"), { status: 429, code: "rate_limit_exceeded" });
      }
      return {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "transport ok",
            },
          },
        ],
        usage: { completion_tokens: 1 },
      };
    });

    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "transport smoke" }];
    await agentLoop({
      client,
      model: "smoke-model",
      promptSource: PROMPT_SOURCE,
      tools: [] as ChatCompletionTool[],
      messages,
      runtimeState: createRuntimeState(),
    });

    const finalMessage = messages[messages.length - 1];
    assert(finalMessage?.role === "assistant" && finalMessage.content === "transport ok", "transport scenario should retry and succeed");
  });

  console.log("PRD16_RECOVERY_SMOKE_OK");
}

main().catch((error) => {
  console.error("PRD16_RECOVERY_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
