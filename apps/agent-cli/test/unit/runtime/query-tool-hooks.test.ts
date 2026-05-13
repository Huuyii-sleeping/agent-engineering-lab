import { describe, expect, it, vi } from "vitest";
import type { HookServiceLike } from "../../../src/services/index.js";
import { makeHookBlockedOutput, runPostToolUseHooks, runPreToolUseHooks } from "../../../src/runtime/query-tool-hooks.js";
import type { AgentRuntimeState } from "../../../src/runtime/query-types.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-tool-hooks-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 1,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createHookService(): HookServiceLike {
  return {
    run: vi.fn(async () => ({
      blocked: false,
      blockReason: null,
      messages: [],
      matched: 1,
      executed: 1,
      errors: [],
    })),
  };
}

describe("runtime/query-tool-hooks", () => {
  it("creates stable hook-blocked output", () => {
    expect(JSON.parse(makeHookBlockedOutput("blocked by test"))).toEqual({
      ok: false,
      error: {
        code: "HOOK_BLOCKED",
        message: "blocked by test",
      },
    });
    expect(JSON.parse(makeHookBlockedOutput(null))).toEqual({
      ok: false,
      error: {
        code: "HOOK_BLOCKED",
        message: "blocked by hook",
      },
    });
  });

  it("passes stable payloads to pre and post tool hooks", async () => {
    const hookService = createHookService();
    const runtimeState = createRuntimeState();

    await runPreToolUseHooks({
      hookService,
      runtimeState,
      traceId: "trace-hooks",
      spanId: "span-hooks",
      toolName: "write_file",
      toolArgs: { path: "tmp/demo.txt" },
    });
    await runPostToolUseHooks({
      hookService,
      runtimeState,
      traceId: "trace-hooks",
      spanId: "span-hooks",
      toolName: "write_file",
      toolArgs: { path: "tmp/demo.txt" },
      toolOutput: '{"ok":true}',
      toolOk: true,
      errorCode: null,
    });

    expect(hookService.run).toHaveBeenNthCalledWith(1, "PreToolUse", {
      session_id: "query-tool-hooks-session",
      trace_id: "trace-hooks",
      span_id: "span-hooks",
      payload: {
        tool_name: "write_file",
        tool_arguments: { path: "tmp/demo.txt" },
      },
    });
    expect(hookService.run).toHaveBeenNthCalledWith(2, "PostToolUse", {
      session_id: "query-tool-hooks-session",
      trace_id: "trace-hooks",
      span_id: "span-hooks",
      payload: {
        tool_name: "write_file",
        tool_arguments: { path: "tmp/demo.txt" },
        tool_output: '{"ok":true}',
        tool_ok: true,
        error_code: null,
      },
    });
  });
});
