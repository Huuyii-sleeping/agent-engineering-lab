import type OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { createClient, ensureModelConfigured, getDefaultModel, getStaticPromptSource } from "../config.js";
import type { StaticPromptSource } from "../prompt/types.js";
import { QueryEngine } from "../runtime/query-engine.js";
import type { AgentRuntimeState, QueryEngineLike } from "../runtime/query-types.js";
import { listToolRegistrations, listTools } from "../tools/index.js";
import type { ToolRegistration } from "../tools/protocol.js";

export type AgentAppRuntimeDeps = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  toolsResolver: () => Promise<ChatCompletionTool[]>;
  toolRegistrationsResolver?: () => Promise<ToolRegistration[]>;
  queryEngine: QueryEngineLike;
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
  const client = overrides.client ?? createClient();
  const model = overrides.model ?? getDefaultModel();
  const promptSource = overrides.promptSource ?? getStaticPromptSource();
  return {
    client,
    model,
    promptSource,
    toolsResolver: overrides.toolsResolver ?? listTools,
    toolRegistrationsResolver: overrides.toolRegistrationsResolver ?? listToolRegistrations,
    queryEngine: overrides.queryEngine ?? new QueryEngine({ client, model, promptSource }),
  };
}
