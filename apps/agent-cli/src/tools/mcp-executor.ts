import { executeProtectedToolHandler, type ToolExecution } from "../runtime/tool-runtime.js";
import { BASE_UNKNOWN_TOOL } from "./base.js";
import { runMcpToolByName } from "./mcp.js";

export type McpToolExecutorLike = {
  run(execution: ToolExecution): Promise<string>;
};

export class McpToolExecutor implements McpToolExecutorLike {
  async run(execution: ToolExecution): Promise<string> {
    return executeProtectedToolHandler({
      name: execution.name,
      args: execution.args,
      handler: async (args) => {
        const mcpOutput = await runMcpToolByName(execution.name, args);
        return mcpOutput ?? BASE_UNKNOWN_TOOL;
      },
    });
  }
}

export const DEFAULT_MCP_TOOL_EXECUTOR = new McpToolExecutor();
