import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import type { HookServiceLike } from "../../../src/services/index.js";
import { applyUserPromptSubmit } from "../../../src/runtime/query-user-prompt.js";
import type { AgentRuntimeState } from "../../../src/runtime/query-types.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-user-prompt-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

describe("runtime/query-user-prompt", () => {
  it("runs UserPromptSubmit hook and appends hook messages before user prompt", async () => {
    const history: ChatCompletionMessageParam[] = [];
    const hookService: HookServiceLike = {
      run: vi.fn(async () => ({
        blocked: false,
        blockReason: null,
        messages: ["hook note"],
        matched: 1,
        executed: 1,
        errors: [],
      })),
    };

    await expect(
      applyUserPromptSubmit({
        history,
        runtimeState: createRuntimeState(),
        prompt: " hello ",
        hookService,
      }),
    ).resolves.toEqual({ ok: true, prompt: "hello" });

    expect(hookService.run).toHaveBeenCalledWith("UserPromptSubmit", {
      session_id: "query-user-prompt-session",
      payload: { prompt: "hello" },
    });
    expect(history).toEqual([
      { role: "system", content: "hook note" },
      { role: "user", content: "hello" },
    ]);
  });

  it("returns blocked prompt errors without mutating history", async () => {
    const history: ChatCompletionMessageParam[] = [];
    const hookService: HookServiceLike = {
      run: vi.fn(async () => ({
        blocked: true,
        blockReason: "blocked",
        messages: ["ignored"],
        matched: 1,
        executed: 1,
        errors: [],
      })),
    };

    await expect(
      applyUserPromptSubmit({
        history,
        runtimeState: createRuntimeState(),
        prompt: "blocked prompt",
        hookService,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "HOOK_BLOCKED",
        message: "blocked",
      },
    });
    expect(history).toEqual([]);
  });
});
