import {
  createToolInputParseError,
  createToolInputValidationError,
  executeProtectedToolHandler,
  validateToolInput,
  type ToolExecution,
} from "../runtime/tool-runtime.js";
import { BASE_UNKNOWN_TOOL } from "./base.js";
import { listMcpToolRegistrations, runMcpToolByName } from "./mcp.js";

export type McpToolExecutorLike = {
  run(execution: ToolExecution): Promise<string>;
};

export class McpToolExecutor implements McpToolExecutorLike {
  async run(execution: ToolExecution): Promise<string> {
    if (execution.parseError) {
      return createToolInputParseError(execution.name, execution.parseError);
    }
    const registration = (await listMcpToolRegistrations()).find((tool) => tool.name === execution.name) ?? null;
    const errors = validateToolInput(registration?.parameters, execution.args);
    if (errors.length > 0) {
      return createToolInputValidationError(execution.name, errors);
    }
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
