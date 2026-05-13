import { describe, expect, it, vi } from "vitest";
import type { ObservabilityServiceLike } from "../../../src/services/index.js";
import {
  maybeAutoCompleteTaskFromTodo,
  syncActiveTaskState,
} from "../../../src/runtime/query-tool-task-sync.js";
import type { AgentRuntimeState } from "../../../src/runtime/query-types.js";
import type { ToolServiceLike } from "../../../src/tools/service.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-tool-task-sync-session",
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
    previewToolCall: () => "",
    runToolByName: vi.fn(async () => '{"ok":true}'),
  };
}

function createObservabilityService(): ObservabilityServiceLike {
  return {
    createTraceId: vi.fn(() => "trace-test"),
    createSpanId: vi.fn(() => "span-task-sync"),
    withExecutionContext: vi.fn(async (_context, fn: () => Promise<unknown>) => fn()),
    recordEvent: vi.fn(),
  };
}

describe("runtime/query-tool-task-sync", () => {
  it("syncs active task from task_create and completed task_update", () => {
    const runtimeState = createRuntimeState();

    syncActiveTaskState({
      runtimeState,
      toolName: "task_create",
      toolArgs: {},
      toolOutput: '{"ok":true,"id":42}',
    });
    expect(runtimeState.activeTaskId).toBe(42);

    syncActiveTaskState({
      runtimeState,
      toolName: "task_update",
      toolArgs: { task_id: 42, status: "completed" },
      toolOutput: '{"ok":true}',
    });
    expect(runtimeState.activeTaskId).toBeNull();
  });

  it("auto-completes active task when todo marks all items completed", async () => {
    const runtimeState = createRuntimeState();
    runtimeState.activeTaskId = 7;
    const toolService = createToolService();
    const observabilityService = createObservabilityService();

    await expect(
      maybeAutoCompleteTaskFromTodo({
        runtimeState,
        toolName: "todo",
        toolArgs: { items: [{ status: "completed" }, { status: "completed" }] },
        traceId: "trace-task-sync",
        toolService,
        observabilityService,
      }),
    ).resolves.toBe(true);

    expect(toolService.runToolByName).toHaveBeenCalledWith(
      "task_update",
      JSON.stringify({
        task_id: 7,
        status: "completed",
      }),
    );
    expect(observabilityService.withExecutionContext).toHaveBeenCalledWith(
      { traceId: "trace-task-sync", spanId: "span-task-sync" },
      expect.any(Function),
    );
    expect(runtimeState.activeTaskId).toBeNull();
  });

  it("does not auto-complete when todo is partial or no task is active", async () => {
    const runtimeState = createRuntimeState();
    const toolService = createToolService();

    await expect(
      maybeAutoCompleteTaskFromTodo({
        runtimeState,
        toolName: "todo",
        toolArgs: { items: [{ status: "completed" }] },
        traceId: "trace-task-sync",
        toolService,
        observabilityService: createObservabilityService(),
      }),
    ).resolves.toBe(true);
    expect(toolService.runToolByName).not.toHaveBeenCalled();

    runtimeState.activeTaskId = 7;
    await expect(
      maybeAutoCompleteTaskFromTodo({
        runtimeState,
        toolName: "todo",
        toolArgs: { items: [{ status: "completed" }, { status: "in_progress" }] },
        traceId: "trace-task-sync",
        toolService,
        observabilityService: createObservabilityService(),
      }),
    ).resolves.toBe(true);
    expect(toolService.runToolByName).not.toHaveBeenCalled();
    expect(runtimeState.activeTaskId).toBe(7);
  });
});
