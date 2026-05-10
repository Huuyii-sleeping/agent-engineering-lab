import { describe, expect, it } from "vitest";
import {
  classifyErrorForRecovery,
  classifyResponseForRecovery,
  createInitialRecoveryState,
  makePromptTooLongSignal,
  selectRecoveryDecision,
  type RecoveryConfig,
} from "../../src/recovery.js";

const TEST_CONFIG: RecoveryConfig = {
  continuationMaxAttempts: 2,
  compactMaxAttempts: 1,
  transportMaxAttempts: 2,
  backoffBaseMs: 10,
  backoffMaxMs: 25,
};

describe("recovery selector", () => {
  it("continues after truncated output until the continuation budget is exhausted", () => {
    const initial = createInitialRecoveryState();
    const first = selectRecoveryDecision({ kind: "output_truncated", finishReason: "length" }, initial, TEST_CONFIG);
    expect(first.action).toBe("continue");
    expect(first.nextState.continuationAttempts).toBe(1);

    const second = selectRecoveryDecision({ kind: "output_truncated", finishReason: "length" }, first.nextState, TEST_CONFIG);
    expect(second.action).toBe("continue");
    expect(second.nextState.continuationAttempts).toBe(2);

    const third = selectRecoveryDecision({ kind: "output_truncated", finishReason: "length" }, second.nextState, TEST_CONFIG);
    expect(third.action).toBe("fail");
    expect(third.reason).toBe("continuation_budget_exhausted");
  });

  it("compacts when the prompt is too long and fails after the compact budget is exhausted", () => {
    const initial = createInitialRecoveryState();
    const first = selectRecoveryDecision(makePromptTooLongSignal("too many tokens", "preflight_estimate"), initial, TEST_CONFIG);
    expect(first.action).toBe("compact");
    expect(first.nextState.compactAttempts).toBe(1);

    const second = selectRecoveryDecision(makePromptTooLongSignal("still too many tokens", "api_context_limit"), first.nextState, TEST_CONFIG);
    expect(second.action).toBe("fail");
    expect(second.reason).toBe("compact_budget_exhausted");
  });

  it("backs off on transient transport errors with exponential delay and cap", () => {
    const initial = createInitialRecoveryState();
    const first = selectRecoveryDecision(
      { kind: "transport_error", reason: "rate_limit", detail: "too many requests" },
      initial,
      TEST_CONFIG,
    );
    expect(first.action).toBe("backoff");
    if (first.action !== "backoff") {
      throw new Error("expected backoff recovery");
    }
    expect(first.delayMs).toBe(10);

    const second = selectRecoveryDecision(
      { kind: "transport_error", reason: "rate_limit", detail: "too many requests" },
      first.nextState,
      TEST_CONFIG,
    );
    expect(second.action).toBe("backoff");
    if (second.action !== "backoff") {
      throw new Error("expected backoff recovery");
    }
    expect(second.delayMs).toBe(20);

    const third = selectRecoveryDecision(
      { kind: "transport_error", reason: "rate_limit", detail: "too many requests" },
      second.nextState,
      TEST_CONFIG,
    );
    expect(third.action).toBe("fail");
    expect(third.reason).toBe("transport_budget_exhausted");
  });
});

describe("recovery classifiers", () => {
  it("classifies truncated responses that can continue", () => {
    const signal = classifyResponseForRecovery({
      finishReason: "length",
      toolCallCount: 0,
      content: "partial answer",
    });
    expect(signal).toEqual({ kind: "output_truncated", finishReason: "length" });
  });

  it("rejects truncated tool calls as unrecoverable", () => {
    const signal = classifyResponseForRecovery({
      finishReason: "length",
      toolCallCount: 1,
      content: "",
    });
    expect(signal).toEqual({
      kind: "fail",
      reason: "truncated_tool_calls",
      detail: "model output truncated while emitting tool calls",
    });
  });

  it("classifies context length and transport failures", () => {
    expect(classifyErrorForRecovery(new Error("maximum context length exceeded"))).toEqual({
      kind: "prompt_too_long",
      reason: "api_context_limit",
      detail: "maximum context length exceeded",
    });

    const rateLimit = Object.assign(new Error("Too many requests"), { status: 429, code: "rate_limit_exceeded" });
    expect(classifyErrorForRecovery(rateLimit)).toEqual({
      kind: "transport_error",
      reason: "rate_limit",
      detail: "Too many requests",
    });
  });
});
