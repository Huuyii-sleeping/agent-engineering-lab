import type OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
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
  onAssistantDelta?: (delta: string) => void | Promise<void>;
}): Promise<QueryModelCompletionResult | null> {
  if (input.onAssistantDelta) {
    return runStreamingQueryModelCompletionRequest({
      ...input,
      onAssistantDelta: input.onAssistantDelta,
    });
  }

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

async function runStreamingQueryModelCompletionRequest(input: {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
  onAssistantDelta: (delta: string) => void | Promise<void>;
}): Promise<QueryModelCompletionResult | null> {
  const startedAt = Date.now();
  const stream = await input.client.chat.completions.create({
    model: input.model,
    messages: input.messages,
    tools: input.tools,
    max_tokens: RUNTIME_CONFIG.modelMaxCompletionTokens,
    stream: true,
  });

  let role: "assistant" = "assistant";
  let content = "";
  let finishReason: string | null = null;
  const toolCallDeltas = new Map<
    number,
    {
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    }
  >();

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) {
      continue;
    }
    finishReason = choice.finish_reason ?? finishReason;
    const delta = choice.delta;
    if (delta.role === "assistant") {
      role = "assistant";
    }
    if (typeof delta.content === "string" && delta.content) {
      content += delta.content;
      await input.onAssistantDelta(delta.content);
    }
    for (const toolCallDelta of delta.tool_calls ?? []) {
      const index = toolCallDelta.index;
      const existing =
        toolCallDeltas.get(index) ??
        {
          id: "",
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
      if (toolCallDelta.id) {
        existing.id = toolCallDelta.id;
      }
      if (toolCallDelta.type === "function") {
        existing.type = "function";
      }
      if (toolCallDelta.function?.name) {
        existing.function.name += toolCallDelta.function.name;
      }
      if (toolCallDelta.function?.arguments) {
        existing.function.arguments += toolCallDelta.function.arguments;
      }
      toolCallDeltas.set(index, existing);
    }
  }

  const toolCalls = Array.from(toolCallDeltas.entries())
    .sort(([left], [right]) => left - right)
    .map(([, toolCall]) => toolCall)
    .filter((toolCall) => toolCall.id && toolCall.function.name) as ChatCompletionMessageToolCall[];
  if (!content && toolCalls.length === 0) {
    return null;
  }

  const message: OpenAI.Chat.Completions.ChatCompletionMessage = {
    role,
    content,
    refusal: null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
  return {
    message,
    content,
    finishReason,
    toolCallCount: toolCalls.length,
    completionTokens: 0,
    latencyMs: Date.now() - startedAt,
  };
}
