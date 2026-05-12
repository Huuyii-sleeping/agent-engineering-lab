import type OpenAI from "openai";
import { createClient, ensureModelConfigured, getDefaultModel, getStaticPromptSource } from "../config.js";
import type { StaticPromptSource } from "../prompt/types.js";
import { QueryEngine } from "../runtime/query-engine.js";
import type { AgentRuntimeState, QueryEngineLike } from "../runtime/query-types.js";
import { DEFAULT_TOOL_SERVICE, type ToolServiceLike } from "../tools/service.js";

export type AgentAppRuntimeDeps = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  toolService: ToolServiceLike;
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
    toolService: overrides.toolService ?? DEFAULT_TOOL_SERVICE,
    queryEngine:
      overrides.queryEngine ??
      new QueryEngine({
        client,
        model,
        promptSource,
        toolService: overrides.toolService ?? DEFAULT_TOOL_SERVICE,
      }),
  };
}
