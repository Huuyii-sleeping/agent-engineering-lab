import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { executeProtectedToolHandler, resolveToolExecution } from "../runtime/tool-runtime.js";
import { BASE_UNKNOWN_TOOL } from "./base.js";
import { listMcpTools, runMcpToolByName } from "./mcp.js";
import {
  BUILTIN_SUBAGENT_TOOL_NAMES,
  BUILTIN_TOOLS,
  previewBuiltinToolCall,
  resolveBuiltinToolHandler,
} from "./registry.js";

const UNKNOWN_TOOL = BASE_UNKNOWN_TOOL;
export const TOOLS: ChatCompletionTool[] = BUILTIN_TOOLS;

export async function listTools(): Promise<ChatCompletionTool[]> {
  return [...TOOLS, ...(await listMcpTools())];
}

export function previewToolCall(name: string, argumentsJson: string): string {
  return previewBuiltinToolCall(name, argumentsJson);
}

export async function runToolByName(name: string, argumentsJson: string): Promise<string> {
  const execution = resolveToolExecution(name, argumentsJson, BUILTIN_SUBAGENT_TOOL_NAMES);

  if (execution.target === "mcp") {
    return executeProtectedToolHandler({
      name: execution.name,
      args: execution.args,
      handler: async (args) => {
        const mcpOutput = await runMcpToolByName(execution.name, args);
        return mcpOutput ?? UNKNOWN_TOOL;
      },
    });
  }

  const builtinHandler = resolveBuiltinToolHandler(execution.name);
  if (!builtinHandler) {
    return UNKNOWN_TOOL;
  }
  return executeProtectedToolHandler({
    name: execution.name,
    args: execution.args,
    handler: builtinHandler.handler,
    allowDuringReplay: builtinHandler.allowDuringReplay,
  });
}
