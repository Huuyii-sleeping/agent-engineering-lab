import type OpenAI from "openai";
import { afterEach, describe, expect, it } from "vitest";
import { AgentService } from "../../src/agent-service.js";
import type { AgentRuntimeState } from "../../src/agent-loop.js";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

function createLoopRunner() {
  return async ({ messages, runtimeState }: {
    messages: ChatCompletionMessageParam[];
    runtimeState: AgentRuntimeState;
  }): Promise<void> => {
    const latestUser = [...messages].reverse().find((item) => item.role === "user");
    messages.push({
      role: "assistant",
      content: `reply:${runtimeState.sessionId}:${typeof latestUser?.content === "string" ? latestUser.content : ""}`,
    });
  };
}

afterEach(() => {
  delete process.env.MODEL_ID;
});

describe("agent service", () => {
  it("creates and lists isolated sessions", () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      tools: [] as ChatCompletionTool[],
      loopRunner: createLoopRunner() as never,
    });
    const first = service.createSession();
    const second = service.createSession();
    const sessions = service.listSessions();
    expect(sessions).toHaveLength(2);
    expect(first.id).not.toBe(second.id);
    expect(sessions[0]?.id).toBe(first.id);
  });

  it("keeps chat history isolated per session", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      tools: [] as ChatCompletionTool[],
      loopRunner: createLoopRunner() as never,
    });
    const a = service.createSession();
    const b = service.createSession();

    const resultA = await service.chat({ session_id: a.id, message: "alpha" });
    const resultB = await service.chat({ session_id: b.id, message: "beta" });

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    expect(String(resultA.assistant)).toContain("alpha");
    expect(String(resultB.assistant)).toContain("beta");
    expect(String(resultA.assistant)).not.toContain("beta");
  });
});
