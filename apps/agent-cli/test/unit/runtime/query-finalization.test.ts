import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeState } from "../../../src/agent-loop.js";
import {
  finalizeAssistantOnlyRound,
  finalizeToolDrivenRound,
  runQueryStopStage,
} from "../../../src/runtime/query-finalization.js";

vi.mock("../../../src/hooks/index.js", () => ({
  runHooks: vi.fn(),
}));

import { runHooks } from "../../../src/hooks/index.js";
import type { DeliveryServiceLike } from "../../../src/delivery-service.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-finalization-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 1,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createDeliveryService(): DeliveryServiceLike {
  return {
    loadLatestReport: async () => null,
    runValidation: vi.fn(),
    runValidateTool: async () => "",
    runReportTool: async () => "",
  };
}

describe("runtime/query-finalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runHooks).mockResolvedValue({
      blocked: false,
      blockReason: null,
      messages: [],
    });
  });

  it("increments roundsWithoutTodo for assistant-only rounds", () => {
    const runtimeState = createRuntimeState();

    const result = finalizeAssistantOnlyRound(runtimeState);

    expect(result.stopReason).toBe("assistant_response");
    expect(runtimeState.roundsWithoutTodo).toBe(1);
  });

  it("runs auto delivery, appends summary, and preserves todo reset semantics", async () => {
    const runtimeState = createRuntimeState();
    runtimeState.roundsWithoutTodo = 3;
    runtimeState.wroteWorkspaceFiles = true;
    runtimeState.touchedPaths.add("apps/agent-cli/src/runtime/query-tools.ts");
    const messages = [] as Array<{ role: string; content?: string }>;
    const deliveryService = createDeliveryService();
    vi.mocked(deliveryService.runValidation).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: 0,
      mode: "auto",
      changedPaths: ["apps/agent-cli/src/runtime/query-tools.ts"],
      summary: {
        status: "passed",
        totalStages: 4,
        passedStages: 4,
        failedStages: 0,
        skippedStages: 0,
      },
      stages: [],
      latestFailure: null,
      risks: [],
      suggestions: [],
    });

    const result = await finalizeToolDrivenRound({
      messages,
      runtimeState,
      traceId: "trace-finalize-pass",
      usedTodo: true,
      deliveryAutoRunEnabled: true,
      deliveryService,
    });

    expect(result.stopReason).toBe("auto_delivery_passed");
    expect(runtimeState.roundsWithoutTodo).toBe(0);
    expect(messages).toEqual([
      {
        role: "assistant",
        content: "Auto delivery validation passed (4/4 stages passed).",
      },
    ]);
  });

  it("returns auto delivery failure summaries and increments rounds when todo was not used", async () => {
    const runtimeState = createRuntimeState();
    runtimeState.roundsWithoutTodo = 1;
    runtimeState.wroteWorkspaceFiles = true;
    runtimeState.touchedPaths.add("apps/agent-cli/src/agent-loop.ts");
    const messages = [] as Array<{ role: string; content?: string }>;
    const deliveryService = createDeliveryService();
    vi.mocked(deliveryService.runValidation).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: 0,
      mode: "auto",
      changedPaths: ["apps/agent-cli/src/agent-loop.ts"],
      summary: {
        status: "failed",
        totalStages: 4,
        passedStages: 2,
        failedStages: 1,
        skippedStages: 1,
      },
      stages: [],
      latestFailure: {
        stage: "build",
        code: "BUILD_FAILED",
        message: "build failed",
        suggestion: "Inspect imports.",
      },
      risks: [],
      suggestions: [],
    });

    const result = await finalizeToolDrivenRound({
      messages,
      runtimeState,
      traceId: "trace-finalize-fail",
      usedTodo: false,
      deliveryAutoRunEnabled: true,
      deliveryService,
    });

    expect(result.stopReason).toBe("auto_delivery_failed");
    expect(runtimeState.roundsWithoutTodo).toBe(2);
    expect(messages).toEqual([
      {
        role: "assistant",
        content: "Auto delivery validation failed at build: BUILD_FAILED. Inspect imports.",
      },
    ]);
  });

  it("appends stop hook system messages at finalization time", async () => {
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string }>;
    vi.mocked(runHooks).mockResolvedValue({
      blocked: false,
      blockReason: null,
      messages: ["stop hook note"],
    });

    await runQueryStopStage({
      messages,
      runtimeState,
      traceId: "trace-stop",
      stopReason: "tool_calls_processed",
      stopToolCallCount: 2,
    });

    expect(runHooks).toHaveBeenCalledWith("Stop", {
      session_id: runtimeState.sessionId,
      trace_id: "trace-stop",
      payload: {
        round: runtimeState.roundCounter,
        outcome: "tool_calls_processed",
        tool_call_count: 2,
      },
    });
    expect(messages).toEqual([
      {
        role: "system",
        content: "stop hook note",
      },
    ]);
  });
});
