import type { AgentRuntimeState } from "./query-types.js";

export function finalizeAssistantRoundCounter(runtimeState: AgentRuntimeState): {
  stopReason: "assistant_response";
} {
  runtimeState.roundsWithoutTodo += 1;
  return {
    stopReason: "assistant_response",
  };
}

export function updateToolDrivenRoundCounter(runtimeState: AgentRuntimeState, usedTodo: boolean): void {
  runtimeState.roundsWithoutTodo = usedTodo ? 0 : runtimeState.roundsWithoutTodo + 1;
}
