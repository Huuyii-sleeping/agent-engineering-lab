import { describe, expect, it } from "vitest";
import {
  finalizeAssistantRoundCounter,
  updateToolDrivenRoundCounter,
} from "../../../src/runtime/query-finalization-rounds.js";
import type { AgentRuntimeState } from "../../../src/runtime/query-types.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-finalization-rounds-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 1,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

describe("runtime/query-finalization-rounds", () => {
  it("increments assistant-only rounds", () => {
    const runtimeState = createRuntimeState();

    expect(finalizeAssistantRoundCounter(runtimeState)).toEqual({ stopReason: "assistant_response" });
    expect(runtimeState.roundsWithoutTodo).toBe(1);
  });

  it("resets or increments tool-driven rounds based on todo usage", () => {
    const runtimeState = createRuntimeState();
    runtimeState.roundsWithoutTodo = 3;

    updateToolDrivenRoundCounter(runtimeState, true);
    expect(runtimeState.roundsWithoutTodo).toBe(0);

    updateToolDrivenRoundCounter(runtimeState, false);
    expect(runtimeState.roundsWithoutTodo).toBe(1);
  });
});
