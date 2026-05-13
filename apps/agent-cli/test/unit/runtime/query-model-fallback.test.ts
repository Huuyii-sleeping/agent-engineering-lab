import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelPolicyServiceLike, ObservabilityServiceLike } from "../../../src/services/index.js";

vi.mock("../../../src/model-policy.js", () => ({
  classifyFallbackableError: vi.fn(() => true),
}));

import { classifyFallbackableError } from "../../../src/model-policy.js";
import { tryQueryModelFallback } from "../../../src/runtime/query-model-fallback.js";

function createClient(response: unknown): OpenAI {
  return {
    chat: {
      completions: {
        create: async () => response,
      },
    },
  } as unknown as OpenAI;
}

function createModelPolicyService(): ModelPolicyServiceLike {
  return {
    selectModel: vi.fn(),
    selectFallbackModel: vi.fn(async () => ({
      role: "coding",
      model: "fallback-model",
      fallbackModel: null,
      estimatedPromptTokens: 20,
      estimatedPromptCostUsd: 0.001,
      budgetAction: "downgrade",
      budgetReason: "request_fallback",
    })),
    finalizeUsage: vi.fn(async () => undefined),
  };
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
      kind: "model_policy_selection",
      payload: {},
    })),
  };
}

async function runFallback(input: {
  client: OpenAI;
  modelPolicyService: ModelPolicyServiceLike;
  observabilityService: ObservabilityServiceLike;
}) {
  return tryQueryModelFallback({
    error: new Error("primary unavailable"),
    client: input.client,
    defaultModel: "primary-model",
    selectedModel: "primary-model",
    estimatedPromptTokens: 20,
    requestMessages: [{ role: "user", content: "hello" }] as ChatCompletionMessageParam[],
    tools: [] as ChatCompletionTool[],
    continuedAssistantContent: "Part A",
    modelPolicyService: input.modelPolicyService,
    observabilityService: input.observabilityService,
    traceId: "trace-fallback",
  });
}

describe("runtime/query-model-fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(classifyFallbackableError).mockReturnValue(true);
  });

  it("runs fallback request once and finalizes usage on success", async () => {
    const modelPolicyService = createModelPolicyService();
    const observabilityService = createObservabilityService();
    const result = await runFallback({
      client: createClient({
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: " and Part B" } }],
        usage: { completion_tokens: 3 },
      }),
      modelPolicyService,
      observabilityService,
    });

    expect(result?.content).toBe("Part A and Part B");
    expect(modelPolicyService.selectFallbackModel).toHaveBeenCalledWith("coding", "primary-model", 20, "primary-model");
    expect(observabilityService.recordEvent).toHaveBeenCalledWith(
      "model_policy_selection",
      expect.objectContaining({
        model: "fallback-model",
        budgetAction: "downgrade",
        budgetReason: "request_fallback",
      }),
      { traceId: "trace-fallback" },
    );
    expect(modelPolicyService.finalizeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "fallback-model",
        promptTokens: 20,
        completionTokens: 3,
        fallbackUsed: true,
      }),
      "trace-fallback",
    );
  });

  it("returns null without selecting fallback when the error is not fallbackable", async () => {
    vi.mocked(classifyFallbackableError).mockReturnValue(false);
    const modelPolicyService = createModelPolicyService();

    await expect(
      runFallback({
        client: createClient({ choices: [] }),
        modelPolicyService,
        observabilityService: createObservabilityService(),
      }),
    ).resolves.toBeNull();
    expect(modelPolicyService.selectFallbackModel).not.toHaveBeenCalled();
  });

  it("returns null when fallback response is empty", async () => {
    const modelPolicyService = createModelPolicyService();
    const observabilityService = createObservabilityService();

    await expect(
      runFallback({
        client: createClient({ choices: [], usage: { completion_tokens: 0 } }),
        modelPolicyService,
        observabilityService,
      }),
    ).resolves.toBeNull();
    expect(observabilityService.recordEvent).not.toHaveBeenCalled();
    expect(modelPolicyService.finalizeUsage).not.toHaveBeenCalled();
  });
});
