import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeState } from "../../../src/agent-loop.js";
import type { DeliveryServiceLike } from "../../../src/delivery-service.js";
import type { HookServiceLike } from "../../../src/hook-service.js";
import { runUserQuery } from "../../../src/runtime/query-runtime.js";
import type { StaticPromptSource } from "../../../src/prompt/types.js";

const PROMPT_SOURCE: StaticPromptSource = {
  core: "test-core",
  tools: [],
  skills: [],
  rules: [],
};

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-runtime-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createDeliveryService(): DeliveryServiceLike {
  return {
    loadLatestReport: async () => null,
    runValidation: async () => {
      throw new Error("not used");
    },
    runValidateTool: async () => "",
    runReportTool: async () => "",
  };
}

function createHookService(overrides: Partial<HookServiceLike> = {}): HookServiceLike {
  return {
    run: vi.fn(async () => ({
      blocked: false,
      blockReason: null,
      messages: [],
      matched: 0,
      executed: 0,
      errors: [],
    })),
    ...overrides,
  };
}

describe("runtime/query-runtime", () => {
  it("runs a user query through shared runtime deps and returns assistant text", async () => {
    const history: ChatCompletionMessageParam[] = [];
    const hookService = createHookService();
    const result = await runUserQuery({
      app: {
        client: {} as OpenAI,
        model: "test-model",
        promptSource: PROMPT_SOURCE,
        toolService: {
          listTools: async () => [] as ChatCompletionTool[],
          listToolRegistrations: async () => [],
          listToolMetadata: async () => [],
          previewToolCall: () => "",
          runToolByName: async () => "",
        },
        deliveryService: createDeliveryService(),
        hookService,
        queryEngine: {
          run: async ({ messages }) => {
            messages.push({ role: "assistant", content: "shared runtime reply" });
          },
        },
      },
      history,
      runtimeState: createRuntimeState(),
      prompt: "hello runtime",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assistant).toBe("shared runtime reply");
    }
    expect(history).toEqual([
      { role: "user", content: "hello runtime" },
      { role: "assistant", content: "shared runtime reply" },
    ]);
    expect(hookService.run).toHaveBeenCalledWith("UserPromptSubmit", {
      session_id: "query-runtime-session",
      payload: { prompt: "hello runtime" },
    });
  });

  it("surfaces blocked prompt hooks before entering the query engine", async () => {
    const hookService = createHookService({
      run: vi.fn(async () => ({
        blocked: true,
        blockReason: "policy blocked",
        messages: [],
        matched: 1,
        executed: 1,
        errors: [],
      })),
    });
    const run = vi.fn();

    const result = await runUserQuery({
      app: {
        client: {} as OpenAI,
        model: "test-model",
        promptSource: PROMPT_SOURCE,
        toolService: {
          listTools: async () => [] as ChatCompletionTool[],
          listToolRegistrations: async () => [],
          listToolMetadata: async () => [],
          previewToolCall: () => "",
          runToolByName: async () => "",
        },
        deliveryService: createDeliveryService(),
        hookService,
        queryEngine: { run },
      },
      history: [],
      runtimeState: createRuntimeState(),
      prompt: "blocked runtime",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "HOOK_BLOCKED",
        message: "policy blocked",
      },
    });
    expect(run).not.toHaveBeenCalled();
  });
});
