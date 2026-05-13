import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { classifyFallbackableError } from "../model-policy.js";
import type { ModelPolicyServiceLike, ObservabilityServiceLike } from "../services/index.js";
import { runQueryModelCompletionRequest } from "./query-model-request.js";

export async function tryQueryModelFallback(input: {
  error: unknown;
  client: OpenAI;
  defaultModel: string;
  selectedModel: string;
  estimatedPromptTokens: number;
  requestMessages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
  continuedAssistantContent: string;
  modelPolicyService: ModelPolicyServiceLike;
  observabilityService: ObservabilityServiceLike;
  traceId: string;
}): Promise<OpenAI.Chat.Completions.ChatCompletionMessage | null> {
  if (!classifyFallbackableError(input.error)) {
    return null;
  }

  const fallbackSelection = await input.modelPolicyService.selectFallbackModel(
    "coding",
    input.defaultModel,
    input.estimatedPromptTokens,
    input.selectedModel,
  );
  if (!fallbackSelection) {
    return null;
  }

  try {
    const completion = await runQueryModelCompletionRequest({
      client: input.client,
      model: fallbackSelection.model,
      messages: input.requestMessages,
      tools: input.tools,
    });
    if (!completion) {
      return null;
    }

    await input.observabilityService.recordEvent(
      "model_policy_selection",
      {
        role: fallbackSelection.role,
        model: fallbackSelection.model,
        fallbackModel: null,
        budgetAction: "downgrade",
        budgetReason: "request_fallback",
      },
      { traceId: input.traceId },
    );
    await input.modelPolicyService.finalizeUsage(
      {
        role: "coding",
        model: fallbackSelection.model,
        promptTokens: input.estimatedPromptTokens,
        completionTokens: completion.completionTokens,
        latencyMs: completion.latencyMs,
        fallbackUsed: true,
      },
      input.traceId,
    );

    return {
      ...completion.message,
      content: input.continuedAssistantContent
        ? `${input.continuedAssistantContent}${completion.content}`
        : completion.content,
    } as OpenAI.Chat.Completions.ChatCompletionMessage;
  } catch {
    return null;
  }
}
