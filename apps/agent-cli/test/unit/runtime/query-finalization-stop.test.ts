import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import type { HookServiceLike } from "../../../src/services/index.js";
import { runQueryStopHooks } from "../../../src/runtime/query-finalization-stop.js";
import type { AgentRuntimeState } from "../../../src/runtime/query-types.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-finalization-stop-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 4,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createHookService(): HookServiceLike {
  return {
    run: vi.fn(async () => ({
      blocked: false,
      blockReason: null,
      messages: ["stop hook note"],
      matched: 1,
      executed: 1,
      errors: [],
    })),
  };
}

describe("runtime/query-finalization-stop", () => {
  it("runs Stop hook with stable payload and appends system messages", async () => {
    const messages: ChatCompletionMessageParam[] = [];
    const hookService = createHookService();

    await runQueryStopHooks({
      messages,
      runtimeState: createRuntimeState(),
      traceId: "trace-stop",
      stopReason: "tool_calls_processed",
      stopToolCallCount: 2,
      hookService,
    });

    expect(hookService.run).toHaveBeenCalledWith("Stop", {
      session_id: "query-finalization-stop-session",
      trace_id: "trace-stop",
      payload: {
        round: 4,
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
