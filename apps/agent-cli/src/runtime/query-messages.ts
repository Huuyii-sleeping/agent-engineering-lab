import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export function appendSystemMessages(messages: ChatCompletionMessageParam[], items: string[]): void {
  for (const item of items) {
    const content = item.trim();
    if (!content) {
      continue;
    }
    messages.push({ role: "system", content });
  }
}

export function findLastAssistantText(messages: ChatCompletionMessageParam[]): string {
  const lastMessage = [...messages].reverse().find((item) => item.role === "assistant");
  return lastMessage?.role === "assistant" && typeof lastMessage.content === "string" ? lastMessage.content : "";
}
