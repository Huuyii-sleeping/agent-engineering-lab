import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { executeProtectedToolHandler, resolveToolExecution } from "../runtime/tool-runtime.js";
import { BASE_UNKNOWN_TOOL } from "./base.js";
import { listMcpToolRegistrations, runMcpToolByName } from "./mcp.js";
import { toChatCompletionTool, toToolMetadata, type ToolRegistration } from "./protocol.js";
import {
  BUILTIN_SUBAGENT_TOOL_NAMES,
  BUILTIN_TOOL_REGISTRATIONS,
  previewBuiltinToolCall,
  resolveBuiltinToolHandler,
} from "./registry.js";

export type ToolServiceLike = {
  listTools(): Promise<ChatCompletionTool[]>;
  listToolRegistrations(): Promise<ToolRegistration[]>;
  listToolMetadata(): Promise<Array<Record<string, string>>>;
  previewToolCall(name: string, argumentsJson: string): string;
  runToolByName(name: string, argumentsJson: string): Promise<string>;
};

const UNKNOWN_TOOL = BASE_UNKNOWN_TOOL;

export class ToolService implements ToolServiceLike {
  async listTools(): Promise<ChatCompletionTool[]> {
    return (await this.listToolRegistrations()).map(toChatCompletionTool);
  }

  async listToolRegistrations(): Promise<ToolRegistration[]> {
    return [...BUILTIN_TOOL_REGISTRATIONS, ...(await listMcpToolRegistrations())];
  }

  async listToolMetadata(): Promise<Array<Record<string, string>>> {
    return (await this.listToolRegistrations()).map(toToolMetadata);
  }

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

export const DEFAULT_TOOL_SERVICE = new ToolService();
