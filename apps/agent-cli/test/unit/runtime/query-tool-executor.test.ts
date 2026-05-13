import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import type { HookServiceLike, ObservabilityServiceLike } from "../../../src/services/index.js";
import { executeQueryFunctionToolCall } from "../../../src/runtime/query-tool-executor.js";
import type { AgentRuntimeState } from "../../../src/runtime/query-types.js";
import type { ToolServiceLike } from "../../../src/tools/service.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-tool-executor-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 1,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createToolService(output: string): ToolServiceLike {
  return {
    listTools: async () => [],
    listToolRegistrations: async () => [],
    listToolMetadata: async () => [],
    previewToolCall: vi.fn((name: string) => `preview:${name}`),
    runToolByName: vi.fn(async () => output),
  };
}

function createHookService(overrides: Partial<Awaited<ReturnType<HookServiceLike["run"]>>> = {}): HookServiceLike {
  return {
    run: vi.fn(async () => ({
      blocked: false,
      blockReason: null,
      messages: [],
      matched: 1,
      executed: 1,
      errors: [],
      ...overrides,
    })),
  };
}

function createObservabilityService(): ObservabilityServiceLike {
  return {
    createTraceId: vi.fn(() => "trace-test"),
    createSpanId: vi.fn(() => "span-executor"),
    withExecutionContext: vi.fn(async (_context, fn: () => Promise<unknown>) => fn()),
    recordEvent: vi.fn(async () => ({
      schemaVersion: 1,
      id: "evt-test",
      at: 0,
      trace_id: "trace-test",
      span_id: "span-executor",
      kind: "tool_call",
      payload: {},
    })),
  };
}

function createToolCall(name: string, argumentsJson: string) {
  return {
    id: "call-test",
    type: "function",
    function: {
      name,
      arguments: argumentsJson,
    },
  } as NonNullable<OpenAI.Chat.Completions.ChatCompletionMessage["tool_calls"]>[number] & { type: "function" };
}

describe("runtime/query-tool-executor", () => {
  it("executes a tool call, records telemetry, and appends tool output", async () => {
    const messages: ChatCompletionMessageParam[] = [];
    const toolService = createToolService('{"ok":true}');
    const observabilityService = createObservabilityService();

    const result = await executeQueryFunctionToolCall({
      toolCall: createToolCall("read_file", '{"path":"README.md"}'),
      messages,
      runtimeState: createRuntimeState(),
      traceId: "trace-executor",
      toolService,
      hookService: createHookService(),
      observabilityService,
    });

    expect(result).toMatchObject({
      toolName: "read_file",
      toolArgs: { path: "README.md" },
      toolOutput: '{"ok":true}',
      analyzed: { ok: true, errorCode: null },
      blocked: false,
      spanId: "span-executor",
    });
    expect(messages).toEqual([
      {
        role: "tool",
        tool_call_id: "call-test",
        content: '{"ok":true}',
      },
    ]);
    expect(observabilityService.recordEvent).toHaveBeenCalledWith(
      "tool_call",
      expect.objectContaining({ toolName: "read_file", preview: "preview:read_file" }),
      { traceId: "trace-executor", spanId: "span-executor" },
    );
    expect(observabilityService.recordEvent).toHaveBeenCalledWith(
      "tool_result",
      expect.objectContaining({ toolName: "read_file", ok: true }),
      { traceId: "trace-executor", spanId: "span-executor" },
    );
  });

  it("records security_blocked events for security failures", async () => {
    const observabilityService = createObservabilityService();

    await executeQueryFunctionToolCall({
      toolCall: createToolCall("write_file", '{"path":"tmp/demo.txt"}'),
      messages: [],
      runtimeState: createRuntimeState(),
      traceId: "trace-security",
      toolService: createToolService('{"ok":false,"error":{"code":"SECURITY_APPROVAL_REQUIRED"}}'),
      hookService: createHookService(),
      observabilityService,
    });

    expect(observabilityService.recordEvent).toHaveBeenCalledWith(
      "security_blocked",
      {
        toolName: "write_file",
        errorCode: "SECURITY_APPROVAL_REQUIRED",
      },
      { traceId: "trace-security", spanId: "span-executor" },
    );
  });

  it("returns hook-blocked output without executing the tool", async () => {
    const messages: ChatCompletionMessageParam[] = [];
    const toolService = createToolService('{"ok":true}');

    const result = await executeQueryFunctionToolCall({
      toolCall: createToolCall("write_file", '{"path":"tmp/demo.txt"}'),
      messages,
      runtimeState: createRuntimeState(),
      traceId: "trace-blocked",
      toolService,
      hookService: createHookService({
        blocked: true,
        blockReason: "blocked by executor test",
        messages: ["pre block"],
      }),
      observabilityService: createObservabilityService(),
    });

    expect(toolService.runToolByName).not.toHaveBeenCalled();
    expect(result.blocked).toBe(true);
    expect(result.analyzed).toMatchObject({
      ok: false,
      errorCode: "HOOK_BLOCKED",
    });
    expect(messages[0]).toEqual({
      role: "system",
      content: "pre block",
    });
    expect(String(messages[1]?.content)).toContain("HOOK_BLOCKED");
  });
});
