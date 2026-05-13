import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import type { PromptEnvelope } from "../../../src/prompt/types.js";
import {
  buildQueryModelRequestMessages,
  runQueryModelCompletionRequest,
  summarizeQueryModelText,
} from "../../../src/runtime/query-model-request.js";

const PROMPT_ENVELOPE: PromptEnvelope = {
  primarySystemPrompt: "primary system",
  supplementalSystemMessages: ["memory context", "dynamic guard"],
  stableSections: [],
  dynamicSections: [],
};

function createClient(response: unknown): OpenAI {
  return {
    chat: {
      completions: {
        create: async () => response,
      },
    },
  } as unknown as OpenAI;
}

describe("runtime/query-model-request", () => {
  it("builds request messages with system envelope and continuation prompt", () => {
    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "hello" }];

    expect(buildQueryModelRequestMessages(PROMPT_ENVELOPE, messages, "", null)).toEqual([
      { role: "system", content: "primary system" },
      { role: "system", content: "memory context" },
      { role: "system", content: "dynamic guard" },
      { role: "user", content: "hello" },
    ]);
    expect(buildQueryModelRequestMessages(PROMPT_ENVELOPE, messages, "Part A", "Continue exactly")).toEqual([
      { role: "system", content: "primary system" },
      { role: "system", content: "memory context" },
      { role: "system", content: "dynamic guard" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "Part A" },
      { role: "user", content: "Continue exactly" },
    ]);
  });

  it("summarizes request text and normalizes completion response", async () => {
    const client = createClient({
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "model response",
            tool_calls: [{ id: "call-1", type: "function", function: { name: "tool", arguments: "{}" } }],
          },
        },
      ],
      usage: { completion_tokens: 7 },
    });

    expect(summarizeQueryModelText(` ${"x".repeat(170)} `)).toBe(`${"x".repeat(160)}...`);
    await expect(
      runQueryModelCompletionRequest({
        client,
        model: "test-model",
        messages: [{ role: "user", content: "hello" }],
        tools: [] as ChatCompletionTool[],
      }),
    ).resolves.toMatchObject({
      content: "model response",
      finishReason: "stop",
      toolCallCount: 1,
      completionTokens: 7,
    });
  });

  it("returns null for empty model choices", async () => {
    await expect(
      runQueryModelCompletionRequest({
        client: createClient({ choices: [], usage: { completion_tokens: 0 } }),
        model: "test-model",
        messages: [{ role: "user", content: "hello" }],
        tools: [] as ChatCompletionTool[],
      }),
    ).resolves.toBeNull();
  });
});
