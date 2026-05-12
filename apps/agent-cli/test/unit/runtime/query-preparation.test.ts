import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../src/runtime/query-notifications.js", () => ({
  collectDynamicSystemMessages: vi.fn(async () => []),
}));

vi.mock("../../../src/tools/memory.js", () => ({
  autoExtractMemory: vi.fn(async () => undefined),
  buildMemoryInjectionForQuery: vi.fn(async () => ({ content: null, usedEntries: 0, estimatedTokens: 0 })),
}));

vi.mock("../../../src/tools/scheduler.js", () => ({
  tickScheduler: vi.fn(async () => undefined),
}));

vi.mock("../../../src/tools/autonomy.js", () => ({
  runAutonomyTick: vi.fn(async () => '{"ok":false}'),
}));

import type { AgentRuntimeState } from "../../../src/agent-loop.js";
import type { HookServiceLike } from "../../../src/hook-service.js";
import { prepareQueryRound } from "../../../src/runtime/query-preparation.js";
import { collectDynamicSystemMessages } from "../../../src/runtime/query-notifications.js";
import { autoExtractMemory, buildMemoryInjectionForQuery } from "../../../src/tools/memory.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "prepare-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 2,
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
      matched: 0,
      executed: 0,
      errors: [],
    })),
  };
}

describe("runtime/query-preparation", () => {
  beforeEach(() => {
    vi.mocked(collectDynamicSystemMessages).mockResolvedValue([]);
    vi.mocked(autoExtractMemory).mockResolvedValue();
    vi.mocked(buildMemoryInjectionForQuery).mockResolvedValue({
      content: null,
      usedEntries: 0,
      estimatedTokens: 0,
    });
  });

  it("returns a blocked result when session-start hooks reject the round", async () => {
    const hookService = createHookService();
    vi.mocked(hookService.run).mockResolvedValue({
      blocked: true,
      blockReason: "policy denied",
      messages: [],
      matched: 1,
      executed: 1,
      errors: [],
    });

    const result = await prepareQueryRound({
      runtimeState: createRuntimeState(),
      traceId: "trace_test",
      latestUserInput: "hello",
      hookService,
    });

    expect(result).toEqual({
      ok: false,
      blockedReason: "policy denied",
    });
  });

  it("collects shared dynamic messages and memory context for the round", async () => {
    const runtimeState = createRuntimeState();
    const hookService = createHookService();
    runtimeState.roundsWithoutTodo = 3;
    vi.mocked(hookService.run).mockResolvedValue({
      blocked: false,
      blockReason: null,
      messages: ["seed"],
      matched: 1,
      executed: 1,
      errors: [],
    });
    vi.mocked(collectDynamicSystemMessages).mockResolvedValue(["seed"]);
    vi.mocked(buildMemoryInjectionForQuery).mockResolvedValue({
      content: "memory block",
      usedEntries: 2,
      estimatedTokens: 40,
    });

    const result = await prepareQueryRound({
      runtimeState,
      traceId: "trace_test",
      latestUserInput: "hello",
      hookService,
    });

    expect(result).toEqual({
      ok: true,
      memoryContext: "memory block",
      dynamicSystemMessages: [
        "seed",
        "<reminder>Please call the todo tool to update the task list and maintain progress.</reminder>",
      ],
    });
    expect(autoExtractMemory).toHaveBeenCalledWith("user", "hello");
    expect(runtimeState.lastMemoryInput).toBe("hello");
  });
});
