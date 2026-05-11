import { describe, expect, it, vi } from "vitest";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type OpenAI from "openai";
import { createAgentAppRuntime, createAgentRuntimeState } from "../../../src/bootstrap/app-runtime.js";
import type { StaticPromptSource } from "../../../src/prompt/types.js";

describe("bootstrap/app-runtime", () => {
  it("creates a fresh runtime state for each session", () => {
    const state = createAgentRuntimeState("session-1");

    expect(state.sessionId).toBe("session-1");
    expect(state.roundCounter).toBe(0);
    expect(state.touchedPaths.size).toBe(0);
    expect(state.wroteWorkspaceFiles).toBe(false);
  });

  it("uses explicit overrides when building app runtime deps", () => {
    const tools = [{ type: "function", function: { name: "echo", parameters: { type: "object", properties: {} } } }] as
      ChatCompletionTool[];
    const toolsResolver = vi.fn(async () => tools);
    const promptSource: StaticPromptSource = { core: "core", tools: [], skills: [], rules: [] };
    const loopRunner = vi.fn();

    const runtime = createAgentAppRuntime({
      client: {} as OpenAI,
      model: "test-model",
      promptSource,
      toolsResolver,
      loopRunner: loopRunner as never,
    });

    expect(runtime.model).toBe("test-model");
    expect(runtime.promptSource).toBe(promptSource);
    expect(runtime.toolsResolver).toBe(toolsResolver);
    expect(runtime.loopRunner).toBe(loopRunner);
  });
});
