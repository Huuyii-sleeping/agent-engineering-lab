import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { toAssistantMessage } from "../../src/messages.js";

function createMessage(argumentsJson: string): OpenAI.Chat.Completions.ChatCompletionMessage {
  return {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "security_request_approval",
          arguments: argumentsJson,
        },
      },
    ],
  } as OpenAI.Chat.Completions.ChatCompletionMessage;
}

describe("messages", () => {
  it("preserves valid object tool arguments", () => {
    const message = toAssistantMessage(createMessage('{ "tool": "write_file", "args_json": "{\\"path\\":\\"tmp/a.txt\\"}" }'));
    const toolCall = message.tool_calls?.[0];

    expect(toolCall?.function.arguments).toBe('{"tool":"write_file","args_json":"{\\"path\\":\\"tmp/a.txt\\"}"}');
  });

  it("normalizes invalid tool arguments to an empty object", () => {
    const message = toAssistantMessage(createMessage("not-json"));
    const toolCall = message.tool_calls?.[0];

    expect(toolCall?.function.arguments).toBe("{}");
  });
});
