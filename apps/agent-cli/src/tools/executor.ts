import { executeProtectedToolHandler, resolveToolExecution } from "../runtime/tool-runtime.js";
import { BASE_UNKNOWN_TOOL } from "./base.js";
import { runMcpToolByName } from "./mcp.js";
import {
  BUILTIN_SUBAGENT_TOOL_NAMES,
  previewBuiltinToolCall,
  resolveBuiltinToolHandler,
} from "./registry.js";

export type ToolExecutorLike = {
  previewToolCall(name: string, argumentsJson: string): string;
  runToolByName(name: string, argumentsJson: string): Promise<string>;
};

const UNKNOWN_TOOL = BASE_UNKNOWN_TOOL;

export class ToolExecutor implements ToolExecutorLike {
  previewToolCall(name: string, argumentsJson: string): string {
    return previewBuiltinToolCall(name, argumentsJson);
  }

  async runToolByName(name: string, argumentsJson: string): Promise<string> {
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
}

export const DEFAULT_TOOL_EXECUTOR = new ToolExecutor();
