import { describe, expect, it, vi } from "vitest";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type OpenAI from "openai";
import { createAgentAppRuntime, createAgentRuntimeState } from "../../../src/bootstrap/app-runtime.js";
import type { DeliveryServiceLike } from "../../../src/delivery-service.js";
import type { HookServiceLike } from "../../../src/hook-service.js";
import type { ObservabilityServiceLike } from "../../../src/observability-service.js";
import type { StaticPromptSource } from "../../../src/prompt/types.js";

describe("bootstrap/app-runtime", () => {
  it("creates a fresh runtime state for each session", () => {
    const state = createAgentRuntimeState("session-1");

    expect(state.sessionId).toBe("session-1");
    expect(state.roundCounter).toBe(0);
    expect(state.touchedPaths.size).toBe(0);
    expect(state.wroteWorkspaceFiles).toBe(false);
  });

  it("uses explicit overrides when building app runtime deps", () => {
    const tools = [{ type: "function", function: { name: "echo", parameters: { type: "object", properties: {} } } }] as ChatCompletionTool[];
    const toolService = {
      listTools: vi.fn(async () => tools),
      listToolRegistrations: vi.fn(async () => []),
      listToolMetadata: vi.fn(async () => []),
      previewToolCall: vi.fn(() => "echo"),
      runToolByName: vi.fn(async () => ""),
    };
    const promptSource: StaticPromptSource = { core: "core", tools: [], skills: [], rules: [] };
    const deliveryService: DeliveryServiceLike = {
      loadLatestReport: vi.fn(async () => null),
      runValidation: vi.fn(async () => {
        throw new Error("not used");
      }),
      runValidateTool: vi.fn(async () => ""),
      runReportTool: vi.fn(async () => ""),
    };
    const hookService: HookServiceLike = {
      run: vi.fn(async () => ({
        blocked: false,
        blockReason: null,
        messages: [],
        matched: 0,
        executed: 0,
        errors: [],
      })),
    };
    const observabilityService: ObservabilityServiceLike = {
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
    const queryEngine = { run: vi.fn() };

    const runtime = createAgentAppRuntime({
      client: {} as OpenAI,
      model: "test-model",
      promptSource,
      toolService,
      deliveryService,
      hookService,
      observabilityService,
      queryEngine,
    });

    expect(runtime.model).toBe("test-model");
    expect(runtime.promptSource).toBe(promptSource);
    expect(runtime.toolService).toBe(toolService);
    expect(runtime.deliveryService).toBe(deliveryService);
    expect(runtime.hookService).toBe(hookService);
    expect(runtime.observabilityService).toBe(observabilityService);
    expect(runtime.queryEngine).toBe(queryEngine);
  });
});
