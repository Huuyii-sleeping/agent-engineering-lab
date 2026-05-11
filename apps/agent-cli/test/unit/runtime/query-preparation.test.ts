import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/hooks/index.js", () => ({
  runHooks: vi.fn(async () => ({ blocked: false, messages: [] })),
}));

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
import { runHooks } from "../../../src/hooks/index.js";
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

describe("runtime/query-preparation", () => {
  beforeEach(() => {
    vi.mocked(runHooks).mockResolvedValue({ blocked: false, messages: [] });
    vi.mocked(collectDynamicSystemMessages).mockResolvedValue([]);
    vi.mocked(autoExtractMemory).mockResolvedValue();
    vi.mocked(buildMemoryInjectionForQuery).mockResolvedValue({
      content: null,
      usedEntries: 0,
      estimatedTokens: 0,
    });
  });

  it("returns a blocked result when session-start hooks reject the round", async () => {
    vi.mocked(runHooks).mockResolvedValue({
      blocked: true,
      blockReason: "policy denied",
      messages: [],
    });

    const result = await prepareQueryRound({
      runtimeState: createRuntimeState(),
      traceId: "trace_test",
      latestUserInput: "hello",
    });

    expect(result).toEqual({
      ok: false,
      blockedReason: "policy denied",
    });
  });

  it("collects shared dynamic messages and memory context for the round", async () => {
    const runtimeState = createRuntimeState();
    runtimeState.roundsWithoutTodo = 3;
    vi.mocked(runHooks).mockResolvedValue({
      blocked: false,
      messages: ["seed"],
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
