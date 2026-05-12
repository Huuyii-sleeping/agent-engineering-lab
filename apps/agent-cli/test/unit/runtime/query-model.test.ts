import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeState } from "../../../src/agent-loop.js";
import type { ObservabilityServiceLike } from "../../../src/observability-service.js";
import { requestQueryModel } from "../../../src/runtime/query-model.js";
import type { StaticPromptSource } from "../../../src/prompt/types.js";

vi.mock("../../../src/model-policy.js", () => ({
  classifyFallbackableError: vi.fn(() => false),
  MODEL_POLICY: {
    selectModel: vi.fn(),
    selectFallbackModel: vi.fn(),
    finalizeUsage: vi.fn(async () => undefined),
  },
}));

vi.mock("../../../src/tools/context-compact.js", () => ({
  COMPACT_THRESHOLD_TOKENS: 100,
  compactMessages: vi.fn(async (context: { messages: ChatCompletionMessageParam[] }) => {
    context.messages.splice(
      0,
      context.messages.length,
      { role: "assistant", content: "Context compacted (auto). compact summary." },
      { role: "user", content: "final prompt after compact" },
    );
    return {
      estimatedBefore: 400,
      estimatedAfter: 40,
      transcriptPath: "tmp/compact.jsonl",
    };
  }),
  estimateTokensFromMessages: vi.fn(() => 20),
}));

import { MODEL_POLICY } from "../../../src/model-policy.js";
import { compactMessages, estimateTokensFromMessages } from "../../../src/tools/context-compact.js";

const PROMPT_SOURCE: StaticPromptSource = {
  core: "test-core",
  tools: [],
  skills: [],
  rules: [],
};

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-model-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 1,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createClient(
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

function createObservabilityService(): ObservabilityServiceLike {
  return {
    createTraceId: vi.fn(() => "trace-test"),
    createSpanId: vi.fn(() => "span-test"),
    withExecutionContext: vi.fn(async (_context, fn: () => Promise<unknown>) => fn()),
    recordEvent: vi.fn(async () => ({
      schemaVersion: 1,
      id: "evt-test",
      at: 0,
      trace_id: "trace-test",
      span_id: null,
      kind: "test",
      payload: {},
    })),
  };
}

describe("runtime/query-model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(estimateTokensFromMessages).mockReturnValue(20);
    vi.mocked(MODEL_POLICY.selectModel).mockResolvedValue({
      role: "coding",
      model: "primary-model",
      fallbackModel: "fallback-model",
      estimatedPromptTokens: 20,
      estimatedPromptCostUsd: 0.01,
      budgetAction: "allow",
      budgetReason: null,
    });
    vi.mocked(MODEL_POLICY.selectFallbackModel).mockResolvedValue(null);
  });

  it("continues after truncated text output and merges the final assistant content", async () => {
    const seenRequests: ChatCompletionMessageParam[][] = [];
    const client = createClient(async (request, callCount) => {
      seenRequests.push(request.messages);
      if (callCount === 1) {
        return {
          choices: [
            {
              finish_reason: "length",
              message: { role: "assistant", content: "Part A" },
            },
          ],
          usage: { completion_tokens: 1 },
        };
      }
      return {
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: " and part B" },
          },
        ],
        usage: { completion_tokens: 1 },
      };
    });
    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "continue" }];
    const observabilityService = createObservabilityService();

    const result = await requestQueryModel({
      client,
      model: "primary-model",
      promptSource: PROMPT_SOURCE,
      tools: [] as ChatCompletionTool[],
      messages,
      runtimeState: createRuntimeState(),
      traceId: "trace-1",
      latestUserInput: "continue",
      memoryContext: null,
      dynamicSystemMessages: [],
      observabilityService,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.content).toBe("Part A and part B");
    }
    expect(seenRequests).toHaveLength(2);
    expect(seenRequests[1]?.some((item) => item.role === "assistant" && item.content === "Part A")).toBe(true);
    expect(
      seenRequests[1]?.some(
        (item) =>
          item.role === "user" &&
          typeof item.content === "string" &&
          item.content.includes("Do not repeat prior text"),
      ),
    ).toBe(true);
  });

  it("auto compacts oversized prompts before the successful request", async () => {
    vi.mocked(estimateTokensFromMessages)
      .mockReturnValueOnce(150)
      .mockReturnValueOnce(20);

    const seenRequests: ChatCompletionMessageParam[][] = [];
    const client = createClient(async (request) => {
      seenRequests.push(request.messages);
      return {
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "compact ok" },
          },
        ],
        usage: { completion_tokens: 1 },
      };
    });
    const messages: ChatCompletionMessageParam[] = [
      { role: "user", content: "x".repeat(180) },
      { role: "assistant", content: "x".repeat(180) },
      { role: "user", content: "trigger compact" },
    ];
    const observabilityService = createObservabilityService();

    const result = await requestQueryModel({
      client,
      model: "primary-model",
      promptSource: PROMPT_SOURCE,
      tools: [] as ChatCompletionTool[],
      messages,
      runtimeState: createRuntimeState(),
      traceId: "trace-2",
      latestUserInput: "trigger compact",
      memoryContext: null,
      dynamicSystemMessages: [],
      observabilityService,
    });

    expect(result.ok).toBe(true);
    expect(compactMessages).toHaveBeenCalledTimes(1);
    expect(seenRequests).toHaveLength(1);
    expect(
      seenRequests[0]?.some(
        (item) =>
          item.role === "assistant" &&
          typeof item.content === "string" &&
          item.content.startsWith("Context compacted (auto)."),
      ),
    ).toBe(true);
  });

  it("stops early and appends a denial message when budget policy rejects the request", async () => {
    vi.mocked(MODEL_POLICY.selectModel).mockResolvedValue({
      role: "coding",
      model: "primary-model",
      fallbackModel: null,
      estimatedPromptTokens: 20,
      estimatedPromptCostUsd: 0.01,
      budgetAction: "deny",
      budgetReason: "daily_budget_exceeded",
    });
    const client = createClient(async () => {
      throw new Error("should not call model API when budget is denied");
    });
    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "budget deny" }];
    const observabilityService = createObservabilityService();

    const result = await requestQueryModel({
      client,
      model: "primary-model",
      promptSource: PROMPT_SOURCE,
      tools: [] as ChatCompletionTool[],
      messages,
      runtimeState: createRuntimeState(),
      traceId: "trace-3",
      latestUserInput: "budget deny",
      memoryContext: null,
      dynamicSystemMessages: [],
      observabilityService,
    });

    expect(result).toEqual({
      ok: false,
      stopReason: "model_budget_denied",
    });
    expect(messages[messages.length - 1]).toEqual({
      role: "assistant",
      content: "Model request denied by budget policy: daily_budget_exceeded.",
    });
  });
});
