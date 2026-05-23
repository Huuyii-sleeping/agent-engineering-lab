import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ObservabilityServiceLike } from "../services/index.js";
import type { AgentRuntimeState } from "./query-types.js";

export type QueryEngineRoundState = {
  traceId: string;
  latestUserInput: string;
  stopReason: string;
  stopToolCallCount: number;
};

export type UserInputIntent = {
  negativeFeedback: boolean;
  keepGoing: boolean;
  categories: Array<"negative_feedback" | "keep_going">;
  inputLength: number;
};

const NEGATIVE_FEEDBACK_REGEX =
  /失败|太差|不好用|不行|糟糕|有问题|wrong|bad|failed|failure|broken|terrible|frustrat|useless|annoying/i;
const KEEP_GOING_REGEX = /继续|接着|别停|不要停|go on|keep going|continue|do not stop|don't stop|carry on/i;

export function summarizeQueryLoopInput(value: string, max = 160): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}...`;
}

/**
 * Classify local diagnostic intent from the latest user input without returning prompt text.
 */
export function classifyUserInputIntent(value: string): UserInputIntent {
  const negativeFeedback = NEGATIVE_FEEDBACK_REGEX.test(value);
  const keepGoing = KEEP_GOING_REGEX.test(value);
  const categories: UserInputIntent["categories"] = [];
  if (negativeFeedback) {
    categories.push("negative_feedback");
  }
  if (keepGoing) {
    categories.push("keep_going");
  }
  return {
    negativeFeedback,
    keepGoing,
    categories,
    inputLength: value.length,
  };
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
      userInputIntent: classifyUserInputIntent(input.latestUserInput),
    },
    { traceId: input.traceId },
  );
}
