import type OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { agentLoop, type AgentRuntimeState } from "../agent-loop.js";
import { createClient, ensureModelConfigured, getDefaultModel, getStaticPromptSource } from "../config.js";
import type { StaticPromptSource } from "../prompt/types.js";
import { listTools } from "../tools/index.js";

export type AgentAppRuntimeDeps = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  toolsResolver: () => Promise<ChatCompletionTool[]>;
  loopRunner: typeof agentLoop;
};

type AgentAppRuntimeOverrides = Partial<AgentAppRuntimeDeps>;

export function createAgentRuntimeState(sessionId: string): AgentRuntimeState {
  return {
    sessionId,
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

export function createAgentAppRuntime(overrides: AgentAppRuntimeOverrides = {}): AgentAppRuntimeDeps {
  if (!overrides.client || !overrides.model || !overrides.promptSource) {
    ensureModelConfigured();
  }
  return {
    client: overrides.client ?? createClient(),
    model: overrides.model ?? getDefaultModel(),
    promptSource: overrides.promptSource ?? getStaticPromptSource(),
    toolsResolver: overrides.toolsResolver ?? listTools,
    loopRunner: overrides.loopRunner ?? agentLoop,
  };
}
