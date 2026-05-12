import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { StaticPromptSource } from "../prompt/types.js";
import type { ToolServiceLike } from "../tools/service.js";

export type AgentRuntimeState = {
  sessionId: string;
  roundsWithoutTodo: number;
  activeTaskId: number | null;
  lastMemoryInput: string | null;
  roundCounter: number;
  touchedPaths: Set<string>;
  wroteWorkspaceFiles: boolean;
};

export type QueryLoopOptions = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  tools: ChatCompletionTool[];
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
};

export type QueryEngineRunInput = {
  tools?: ChatCompletionTool[];
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
};

export type QueryEngineLike = {
  run(opts: QueryEngineRunInput): Promise<void>;
};

export type QueryToolServiceHolder = {
  toolService: ToolServiceLike;
};
