import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { DeliveryServiceLike, HookServiceLike } from "../services/index.js";
import type { AgentRuntimeState } from "./query-types.js";

export type ToolDrivenStopReason = "tool_calls_processed" | "auto_delivery_passed" | "auto_delivery_failed";

export type FinalizeToolDrivenRoundOptions = {
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
  usedTodo: boolean;
  deliveryAutoRunEnabled: boolean;
  deliveryService: DeliveryServiceLike;
};

export type RunQueryStopStageOptions = {
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
  stopReason: string;
  stopToolCallCount: number;
  hookService: HookServiceLike;
};
