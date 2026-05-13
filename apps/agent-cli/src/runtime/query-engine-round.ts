import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ObservabilityServiceLike } from "../services/index.js";
import type { AgentRuntimeState } from "./query-types.js";

export type QueryEngineRoundState = {
  traceId: string;
  latestUserInput: string;
  stopReason: string;
  stopToolCallCount: number;
};

export function summarizeQueryLoopInput(value: string, max = 160): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}...`;
}

export function findLatestUserInput(messages: ChatCompletionMessageParam[]): string {
  const latestUser = [...messages]
    .reverse()
    .find((item) => item.role === "user" && typeof item.content === "string") as
    | { role: "user"; content: string }
    | undefined;
  return latestUser?.content ?? "";
}

export function beginQueryEngineRound(input: {
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  observabilityService: ObservabilityServiceLike;
}): QueryEngineRoundState {
  input.runtimeState.roundCounter += 1;
  input.runtimeState.touchedPaths.clear();
  input.runtimeState.wroteWorkspaceFiles = false;

  return {
    traceId: input.observabilityService.createTraceId(),
    latestUserInput: findLatestUserInput(input.messages),
    stopReason: "tool_calls_processed",
    stopToolCallCount: 0,
  };
}

export async function recordQueryLoopStart(input: {
  observabilityService: ObservabilityServiceLike;
  traceId: string;
  round: number;
  latestUserInput: string;
}): Promise<void> {
  await input.observabilityService.recordEvent(
    "loop_start",
    {
      round: input.round,
      latestUserInput: input.latestUserInput ? summarizeQueryLoopInput(input.latestUserInput) : "",
    },
    { traceId: input.traceId },
  );
}
