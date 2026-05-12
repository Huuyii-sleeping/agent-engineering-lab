import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeState } from "../../../src/agent-loop.js";
import type { HookServiceLike } from "../../../src/hook-service.js";
import type { ObservabilityServiceLike } from "../../../src/observability-service.js";
import { runQueryToolStage } from "../../../src/runtime/query-tools.js";
import type { ToolServiceLike } from "../../../src/tools/service.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-tools-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 1,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createToolService(): ToolServiceLike {
  return {
    listTools: async () => [],
    listToolRegistrations: async () => [],
    listToolMetadata: async () => [],
    previewToolCall: vi.fn((name: string) => `preview:${name}`),
    runToolByName: vi.fn(),
  };
}

function createHookService(): HookServiceLike {
  return {
    run: vi.fn(async () => ({
      blocked: false,
      blockReason: null,
      messages: [],
      matched: 0,
      executed: 0,
      errors: [],
    })),
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
      span_id: "span-test",
      kind: "tool_call",
      payload: {},
    })),
  };
}

function createMessage(toolCalls: Array<{ id: string; name: string; argumentsJson: string }>): OpenAI.Chat.Completions.ChatCompletionMessage {
  return {
    role: "assistant",
    content: "",
    tool_calls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: toolCall.argumentsJson,
      },
    })),
  } as OpenAI.Chat.Completions.ChatCompletionMessage;
}

describe("runtime/query-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records successful write side effects and appends post-tool hook messages", async () => {
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string; tool_call_id?: string }>;
    const toolService = createToolService();
    const hookService = createHookService();
    const observabilityService = createObservabilityService();
    vi.mocked(toolService.runToolByName).mockResolvedValueOnce(JSON.stringify({ ok: true }));
    vi.mocked(hookService.run)
      .mockResolvedValueOnce({
        blocked: false,
        blockReason: null,
        messages: [],
        matched: 1,
        executed: 1,
        errors: [],
      })
      .mockResolvedValueOnce({
        blocked: false,
        blockReason: null,
        messages: ["write reviewed by hook"],
        matched: 1,
        executed: 1,
        errors: [],
      });

    const result = await runQueryToolStage({
      message: createMessage([
        {
          id: "call_write",
          name: "write_file",
          argumentsJson: JSON.stringify({ path: "tmp/demo.txt", content: "hello" }),
        },
      ]),
      messages,
      runtimeState,
      traceId: "trace-write",
      toolService,
      hookService,
      observabilityService,
    });

    expect(result.usedTodo).toBe(false);
    expect(runtimeState.wroteWorkspaceFiles).toBe(true);
    expect([...runtimeState.touchedPaths]).toEqual(["tmp/demo.txt"]);
    expect(messages).toEqual([
      {
        role: "tool",
        tool_call_id: "call_write",
        content: JSON.stringify({ ok: true }),
      },
      {
        role: "system",
        content: "write reviewed by hook",
      },
    ]);
  });

  it("returns hook-blocked tool output without executing the underlying tool", async () => {
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string; tool_call_id?: string }>;
    const toolService = createToolService();
    const hookService = createHookService();
    const observabilityService = createObservabilityService();
    vi.mocked(hookService.run).mockResolvedValueOnce({
      blocked: true,
      blockReason: "blocked by test",
      messages: ["pre block notice"],
      matched: 1,
      executed: 1,
      errors: [],
    });

    const result = await runQueryToolStage({
      message: createMessage([
        {
          id: "call_blocked",
          name: "write_file",
          argumentsJson: JSON.stringify({ path: "tmp/blocked.txt", content: "nope" }),
        },
      ]),
      messages,
      runtimeState,
      traceId: "trace-blocked",
      toolService,
      hookService,
      observabilityService,
    });

    expect(result.usedTodo).toBe(false);
    expect(toolService.runToolByName).not.toHaveBeenCalled();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      role: "system",
      content: "pre block notice",
    });
    expect(messages[1]?.role).toBe("tool");
    expect(String(messages[1]?.content)).toContain("HOOK_BLOCKED");
  });

  it("auto-completes the active task when todo marks every item completed", async () => {
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string; tool_call_id?: string }>;
    const toolService = createToolService();
    const hookService = createHookService();
    const observabilityService = createObservabilityService();
    vi.mocked(toolService.runToolByName)
      .mockResolvedValueOnce(JSON.stringify({ ok: true, id: 42 }))
      .mockResolvedValueOnce(JSON.stringify({ ok: true }))
      .mockResolvedValueOnce(JSON.stringify({ ok: true }));

    const result = await runQueryToolStage({
      message: createMessage([
        {
          id: "call_create",
          name: "task_create",
          argumentsJson: JSON.stringify({ title: "demo task" }),
        },
        {
          id: "call_todo",
          name: "todo",
          argumentsJson: JSON.stringify({
            items: [
              { text: "a", status: "completed" },
              { text: "b", status: "completed" },
            ],
          }),
        },
      ]),
      messages,
      runtimeState,
      traceId: "trace-todo",
      toolService,
      hookService,
      observabilityService,
    });

    expect(result.usedTodo).toBe(true);
    expect(toolService.runToolByName).toHaveBeenNthCalledWith(1, "task_create", JSON.stringify({ title: "demo task" }));
    expect(toolService.runToolByName).toHaveBeenNthCalledWith(
      2,
      "todo",
      JSON.stringify({
        items: [
          { text: "a", status: "completed" },
          { text: "b", status: "completed" },
        ],
      }),
    );
    expect(toolService.runToolByName).toHaveBeenNthCalledWith(
      3,
      "task_update",
      JSON.stringify({
        task_id: 42,
        status: "completed",
      }),
    );
    expect(runtimeState.activeTaskId).toBeNull();
  });
});
