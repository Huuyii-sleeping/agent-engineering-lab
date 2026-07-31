import OpenAI from "openai";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

function normalizeToolArguments(argumentsValue: string): string {
  const trimmed = argumentsValue.trim();
  if (!trimmed) {
    return "{}";
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify(parsed);
    }
  } catch {
    return "{}";
  }
  return "{}";
}

export function toAssistantMessage(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): ChatCompletionMessageParam {
  const functionToolCalls = message.tool_calls?.filter(
    (toolCall): toolCall is ChatCompletionMessageFunctionToolCall => toolCall.type === "function",
  );

  return {
    role: "assistant",
    content: message.content ?? "",
    tool_calls: functionToolCalls?.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.function.name,
        arguments: normalizeToolArguments(toolCall.function.arguments),
      },
    })),
  };
}
