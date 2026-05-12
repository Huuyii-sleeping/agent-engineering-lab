import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeState } from "../../../src/runtime/query-types.js";

vi.mock("../../../src/observability/runtime.js", () => ({
  createTraceId: vi.fn(() => "trace-query-engine"),
  recordObservabilityEvent: vi.fn(async () => undefined),
}));

vi.mock("../../../src/runtime/query-preparation.js", () => ({
  prepareQueryRound: vi.fn(),
}));

vi.mock("../../../src/runtime/query-model.js", () => ({
  requestQueryModel: vi.fn(),
}));

vi.mock("../../../src/runtime/query-tools.js", () => ({
  runQueryToolStage: vi.fn(),
}));

vi.mock("../../../src/runtime/query-finalization.js", () => ({
  finalizeAssistantOnlyRound: vi.fn(),
  finalizeToolDrivenRound: vi.fn(),
  runQueryStopStage: vi.fn(async () => undefined),
}));

import { QueryEngine } from "../../../src/runtime/query-engine.js";
import { finalizeAssistantOnlyRound, runQueryStopStage } from "../../../src/runtime/query-finalization.js";
import { requestQueryModel } from "../../../src/runtime/query-model.js";
import { prepareQueryRound } from "../../../src/runtime/query-preparation.js";
import type { DeliveryServiceLike } from "../../../src/delivery-service.js";
import type { ToolServiceLike } from "../../../src/tools/service.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-engine-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createToolService(): ToolServiceLike {
  return {
    listTools: async () => [],
    listToolRegistrations: async () => [],
    listToolMetadata: async () => [],
    previewToolCall: () => "",
    runToolByName: async () => "",
  };
}

function createDeliveryService(): DeliveryServiceLike {
  return {
    loadLatestReport: async () => null,
    runValidation: async () => {
      throw new Error("not expected in assistant-only round");
    },
    runValidateTool: async () => "",
    runReportTool: async () => "",
  };
}

describe("runtime/query-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prepareQueryRound).mockResolvedValue({
      ok: true,
      memoryContext: null,
      dynamicSystemMessages: [],
    });
    vi.mocked(finalizeAssistantOnlyRound).mockImplementation((runtimeState) => {
      runtimeState.roundsWithoutTodo += 1;
      return { stopReason: "assistant_response" };
    });
  });

  it("runs the staged query flow and stops cleanly on assistant-only rounds", async () => {
    vi.mocked(requestQueryModel).mockResolvedValue({
      ok: true,
      message: {
        role: "assistant",
        content: "engine reply",
      },
    });

    const engine = new QueryEngine({
      client: {} as never,
      model: "test-model",
      promptSource: {
        core: "test-core",
        tools: [],
        skills: [],
        rules: [],
      },
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
    });
    const runtimeState = createRuntimeState();
    const messages = [{ role: "user", content: "hello engine" }] as Array<{ role: "user" | "assistant"; content: string }>;

    await engine.run({
      tools: [],
      messages,
      runtimeState,
    });

    expect(runtimeState.roundCounter).toBe(1);
    expect(runtimeState.roundsWithoutTodo).toBe(1);
    expect(messages[messages.length - 1]).toEqual({
      role: "assistant",
      content: "engine reply",
      tool_calls: undefined,
    });
    expect(runQueryStopStage).toHaveBeenCalledWith({
      messages,
      runtimeState,
      traceId: "trace-query-engine",
      stopReason: "assistant_response",
      stopToolCallCount: 0,
    });
  });
});
