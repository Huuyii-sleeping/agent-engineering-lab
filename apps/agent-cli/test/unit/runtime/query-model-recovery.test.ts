import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObservabilityServiceLike } from "../../../src/services/index.js";

vi.mock("../../../src/tools/context-compact.js", () => ({
  compactMessages: vi.fn(async (context: { messages: ChatCompletionMessageParam[] }) => {
    context.messages.splice(0, context.messages.length, { role: "user", content: "compacted prompt" });
    return {
      estimatedBefore: 300,
      estimatedAfter: 40,
      transcriptPath: "tmp/compact.jsonl",
    };
  }),
}));

import {
  appendQueryModelRecoveryFailure,
  applyQueryModelPreflightRecovery,
} from "../../../src/runtime/query-model-recovery.js";
import { compactMessages } from "../../../src/tools/context-compact.js";

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
      kind: "recovery_decision",
      payload: {},
    })),
  };
}

describe("runtime/query-model-recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends recovery failure message and records an error event", async () => {
    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "hello" }];
    const observabilityService = createObservabilityService();

    await appendQueryModelRecoveryFailure({
      messages,
      observabilityService,
      traceId: "trace-recovery",
      phase: "model_request",
      decision: {
        reason: "transport_budget_exhausted",
        detail: "retry budget exhausted",
      },
    });

    expect(messages[messages.length - 1]).toEqual({
      role: "assistant",
      content: "Model request failed: transport_budget_exhausted. retry budget exhausted",
    });
    expect(observabilityService.recordEvent).toHaveBeenCalledWith(
      "error",
      {
        phase: "model_request",
        message: "Model request failed: transport_budget_exhausted. retry budget exhausted",
      },
      { traceId: "trace-recovery" },
    );
  });

  it("records preflight compact decision and mutates messages through compact", async () => {
    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "long prompt" }];
    const observabilityService = createObservabilityService();

    const result = await applyQueryModelPreflightRecovery({
      messages,
      estimatedPromptTokens: 150,
      thresholdTokens: 100,
      recoveryState: {
        continuationAttempts: 0,
        compactAttempts: 0,
        transportAttempts: 0,
      },
      round: 3,
      observabilityService,
      traceId: "trace-preflight",
    });

    expect(result).toEqual({
      ok: true,
      recoveryState: {
        continuationAttempts: 0,
        compactAttempts: 1,
        transportAttempts: 0,
      },
    });
    expect(compactMessages).toHaveBeenCalledTimes(1);
    expect(messages).toEqual([{ role: "user", content: "compacted prompt" }]);
    expect(observabilityService.recordEvent).toHaveBeenCalledWith(
      "recovery_decision",
      expect.objectContaining({
        round: 3,
        action: "compact",
        reason: "prompt_too_long",
        estimatedPromptTokens: 150,
      }),
      { traceId: "trace-preflight" },
    );
  });
});
