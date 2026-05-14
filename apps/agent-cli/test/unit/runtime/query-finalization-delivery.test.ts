import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import type { DeliveryReport } from "../../../src/delivery/index.js";
import type { DeliveryServiceLike } from "../../../src/services/index.js";
import {
  runAutoDeliveryFinalizer,
  summarizeAutoDeliveryReport,
} from "../../../src/runtime/query-finalization-delivery.js";
import type { AgentRuntimeState } from "../../../src/runtime/query-types.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-finalization-delivery-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 1,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createReport(status: "passed" | "failed"): DeliveryReport {
  return {
    schemaVersion: 1,
    generatedAt: 0,
    mode: "auto",
    changedPaths: ["apps/agent-cli/src/runtime/query-finalization.ts"],
    summary: {
      status,
      totalStages: 4,
      passedStages: status === "passed" ? 4 : 2,
      failedStages: status === "passed" ? 0 : 1,
      skippedStages: status === "passed" ? 0 : 1,
    },
    stages: [],
    latestFailure:
      status === "failed"
        ? {
            stage: "build",
            code: "BUILD_FAILED",
            message: "build failed",
            suggestion: "Inspect imports.",
          }
        : null,
    risks: [],
    suggestions: [],
  };
}

function createDeliveryService(report: DeliveryReport): DeliveryServiceLike {
  return {
    loadLatestReport: async () => null,
    runValidation: vi.fn(async () => report),
    runValidateTool: async () => "",
    runReportTool: async () => "",
  };
}

describe("runtime/query-finalization-delivery", () => {
  it("summarizes delivery pass and fail reports without changing wording", () => {
    expect(summarizeAutoDeliveryReport(createReport("passed"))).toBe("Auto delivery validation passed (4/4 stages passed).");
    expect(summarizeAutoDeliveryReport(createReport("failed"))).toBe(
      "Auto delivery validation failed at build: BUILD_FAILED. Inspect imports.",
    );
  });

  it("runs auto delivery only when enabled and write side effects exist", async () => {
    const runtimeState = createRuntimeState();
    runtimeState.wroteWorkspaceFiles = true;
    runtimeState.touchedPaths.add("apps/agent-cli/src/runtime/query-finalization.ts");
    const messages: ChatCompletionMessageParam[] = [];
    const deliveryService = createDeliveryService(createReport("passed"));

    await expect(
      runAutoDeliveryFinalizer({
        messages,
        runtimeState,
        traceId: "trace-delivery",
        deliveryAutoRunEnabled: true,
        deliveryService,
      }),
    ).resolves.toBe("auto_delivery_passed");

    expect(deliveryService.runValidation).toHaveBeenCalledWith({
      mode: "auto",
      changedPaths: ["apps/agent-cli/src/runtime/query-finalization.ts"],
      traceId: "trace-delivery",
    });
    expect(messages).toEqual([
      {
        role: "assistant",
        content: "Auto delivery validation passed (4/4 stages passed).",
      },
    ]);
  });

  it("skips auto delivery when disabled or no writes occurred", async () => {
    const deliveryService = createDeliveryService(createReport("passed"));

    await expect(
      runAutoDeliveryFinalizer({
        messages: [],
        runtimeState: createRuntimeState(),
        traceId: "trace-delivery",
        deliveryAutoRunEnabled: true,
        deliveryService,
      }),
    ).resolves.toBe("tool_calls_processed");
    await expect(
      runAutoDeliveryFinalizer({
        messages: [],
        runtimeState: createRuntimeState(),
        traceId: "trace-delivery",
        deliveryAutoRunEnabled: false,
        deliveryService,
      }),
    ).resolves.toBe("tool_calls_processed");
    expect(deliveryService.runValidation).not.toHaveBeenCalled();
  });
});
