import { describe, expect, it, vi } from "vitest";
import {
  beginQueryEngineRound,
  classifyUserInputIntent,
  findLatestUserInput,
  recordQueryLoopStart,
  summarizeQueryLoopInput,
} from "../../../src/runtime/query-engine-round.js";
import type { AgentRuntimeState } from "../../../src/runtime/query-types.js";
import type { ObservabilityServiceLike } from "../../../src/services/index.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-engine-round-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set(["changed.txt"]),
    wroteWorkspaceFiles: true,
  };
}

function createObservabilityService(): ObservabilityServiceLike {
  return {
    createTraceId: vi.fn(() => "trace-round"),
    createSpanId: vi.fn(() => "span-round"),
    withExecutionContext: vi.fn(async (_context, fn: () => Promise<unknown>) => fn()),
    recordEvent: vi.fn(async () => ({
      schemaVersion: 1,
      id: "evt-round",
      at: 0,
      trace_id: "trace-round",
      span_id: null,
      kind: "loop_start",
      payload: {},
    })),
  };
}

describe("runtime/query-engine-round", () => {
  it("finds latest user input and summarizes loop input", () => {
    expect(
      findLatestUserInput([
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "second" },
      ]),
    ).toBe("second");
    expect(summarizeQueryLoopInput(` ${"x".repeat(170)} `)).toBe(`${"x".repeat(160)}...`);
  });

  it("starts a round with reset runtime state and default stop state", () => {
    const runtimeState = createRuntimeState();
    const observabilityService = createObservabilityService();

    const round = beginQueryEngineRound({
      messages: [{ role: "user", content: "hello" }],
      runtimeState,
      observabilityService,
    });

    expect(round).toEqual({
      traceId: "trace-round",
      latestUserInput: "hello",
      stopReason: "tool_calls_processed",
      stopToolCallCount: 0,
    });
    expect(runtimeState.roundCounter).toBe(1);
    expect(runtimeState.touchedPaths.size).toBe(0);
    expect(runtimeState.wroteWorkspaceFiles).toBe(false);
  });

  it("records stable loop_start metadata", async () => {
    const observabilityService = createObservabilityService();

    await recordQueryLoopStart({
      observabilityService,
      traceId: "trace-round",
      round: 3,
      latestUserInput: " inspect runtime ",
    });

    expect(observabilityService.recordEvent).toHaveBeenCalledWith(
      "loop_start",
      {
        round: 3,
        latestUserInput: "inspect runtime",
        userInputIntent: {
          negativeFeedback: false,
          keepGoing: false,
          categories: [],
          inputLength: 17,
        },
      },
      { traceId: "trace-round" },
    );
  });

  it("classifies negative feedback and keep-going input without carrying raw prompt text", () => {
    const intent = classifyUserInputIntent("又失败了，太差了。继续执行，不要停。");

    expect(intent).toEqual({
      negativeFeedback: true,
      keepGoing: true,
      categories: ["negative_feedback", "keep_going"],
      inputLength: 18,
    });
    expect(JSON.stringify(intent)).not.toContain("失败");
    expect(JSON.stringify(intent)).not.toContain("继续执行");
  });

  it("classifies ordinary input as neutral", () => {
    expect(classifyUserInputIntent("帮我检查当前项目状态")).toEqual({
      negativeFeedback: false,
      keepGoing: false,
      categories: [],
      inputLength: 10,
    });
  });
});
