import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import type { AgentRuntimeState } from "../../../src/agent-loop.js";
import { runUserQuery } from "../../../src/runtime/query-runtime.js";
import type { StaticPromptSource } from "../../../src/prompt/types.js";

const PROMPT_SOURCE: StaticPromptSource = {
  core: "test-core",
  tools: [],
  skills: [],
  rules: [],
};

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-runtime-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

describe("runtime/query-runtime", () => {
  it("runs a user query through shared runtime deps and returns assistant text", async () => {
    const history: ChatCompletionMessageParam[] = [];
    const result = await runUserQuery({
      app: {
        client: {} as OpenAI,
        model: "test-model",
        promptSource: PROMPT_SOURCE,
        toolsResolver: async () => [] as ChatCompletionTool[],
        queryEngine: {
          run: async ({ messages }) => {
            messages.push({ role: "assistant", content: "shared runtime reply" });
          },
        },
      },
      history,
      runtimeState: createRuntimeState(),
      prompt: "hello runtime",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assistant).toBe("shared runtime reply");
    }
    expect(history).toEqual([
      { role: "user", content: "hello runtime" },
      { role: "assistant", content: "shared runtime reply" },
    ]);
  });
});
