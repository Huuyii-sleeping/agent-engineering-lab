import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { AgentRuntimeState } from "../agent-loop.js";
import type { StaticPromptSource } from "../prompt/types.js";
import type { ModelPolicyServiceLike, ObservabilityServiceLike } from "../services/index.js";

export type QueryModelResult =
  | {
      ok: true;
      message: OpenAI.Chat.Completions.ChatCompletionMessage;
    }
  | {
      ok: false;
      stopReason: "empty_model_response" | "model_budget_denied" | "recovery_failed";
    };

export type RequestQueryModelOptions = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  tools: ChatCompletionTool[];
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
  latestUserInput: string;
  memoryContext: string | null;
  dynamicSystemMessages: string[];
  modelPolicyService: ModelPolicyServiceLike;
  observabilityService: ObservabilityServiceLike;
  onAssistantDelta?: (delta: string) => void | Promise<void>;
};

export type QueryModelCompletionResult = {
  message: OpenAI.Chat.Completions.ChatCompletionMessage;
  content: string;
  finishReason: string | null;
  toolCallCount: number;
  completionTokens: number;
  latencyMs: number;
};
