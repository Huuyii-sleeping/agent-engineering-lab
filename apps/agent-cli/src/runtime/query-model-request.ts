import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { PromptEnvelope } from "../prompt/types.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import type { QueryModelCompletionResult } from "./query-model-types.js";

export function summarizeQueryModelText(value: string, max = 160): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}...`;
}

export function buildQueryModelRequestMessages(
  promptEnvelope: PromptEnvelope,
  messages: ChatCompletionMessageParam[],
  continuedAssistantContent: string,
  continuationPrompt: string | null,
): ChatCompletionMessageParam[] {
  const requestMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: promptEnvelope.primarySystemPrompt },
    ...promptEnvelope.supplementalSystemMessages.map(
      (content) => ({ role: "system", content }) satisfies ChatCompletionMessageParam,
    ),
    ...messages,
  ];
  if (continuedAssistantContent) {
    requestMessages.push({ role: "assistant", content: continuedAssistantContent });
    requestMessages.push({ role: "user", content: continuationPrompt ?? "Continue." });
  }
  return requestMessages;
}

export async function runQueryModelCompletionRequest(input: {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
}): Promise<QueryModelCompletionResult | null> {
  const startedAt = Date.now();
  const response = await input.client.chat.completions.create({
    model: input.model,
    messages: input.messages,
    tools: input.tools,
    max_tokens: RUNTIME_CONFIG.modelMaxCompletionTokens,
  });

  const message = response.choices[0]?.message;
  if (!message) {
    return null;
  }

  const content = typeof message.content === "string" ? message.content : "";
  return {
    message,
    content,
    finishReason: response.choices[0]?.finish_reason ?? null,
    toolCallCount: message.tool_calls?.length ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - startedAt,
  };
}
