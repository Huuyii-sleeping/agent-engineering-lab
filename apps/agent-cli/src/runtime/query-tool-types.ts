import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { HookServiceLike, ObservabilityServiceLike } from "../services/index.js";
import type { ToolServiceLike } from "../tools/service.js";
import type { ToolOutputAnalysis } from "./query-tool-results.js";
import type { AgentRuntimeState } from "./query-types.js";

export type QueryToolStageResult = {
  usedTodo: boolean;
};

export type RunQueryToolStageOptions = {
  message: OpenAI.Chat.Completions.ChatCompletionMessage;
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
  toolService: ToolServiceLike;
  hookService: HookServiceLike;
  observabilityService: ObservabilityServiceLike;
};

export type QueryFunctionToolCall = NonNullable<OpenAI.Chat.Completions.ChatCompletionMessage["tool_calls"]>[number] & {
  type: "function";
};

export type QueryToolExecutionResult = {
  toolName: string;
  toolArgs: Record<string, unknown>;
  argumentsJson: string;
  preview: string;
  toolOutput: string;
  analyzed: ToolOutputAnalysis;
  blocked: boolean;
  spanId: string;
};
