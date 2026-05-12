import { resolveToolExecution } from "../runtime/tool-runtime.js";
import {
  DEFAULT_BUILTIN_TOOL_EXECUTOR,
  type BuiltinToolExecutorLike,
} from "./builtin-executor.js";
import {
  DEFAULT_MCP_TOOL_EXECUTOR,
  type McpToolExecutorLike,
} from "./mcp-executor.js";
import {
  BUILTIN_SUBAGENT_TOOL_NAMES,
} from "./registry.js";

export type ToolExecutorLike = {
  previewToolCall(name: string, argumentsJson: string): string;
  runToolByName(name: string, argumentsJson: string): Promise<string>;
};

export class ToolExecutor implements ToolExecutorLike {
  constructor(
    private readonly builtinExecutor: BuiltinToolExecutorLike = DEFAULT_BUILTIN_TOOL_EXECUTOR,
    private readonly mcpExecutor: McpToolExecutorLike = DEFAULT_MCP_TOOL_EXECUTOR,
  ) {}

  previewToolCall(name: string, argumentsJson: string): string {
    return this.builtinExecutor.previewToolCall(name, argumentsJson);
  }

  async runToolByName(name: string, argumentsJson: string): Promise<string> {
    const execution = resolveToolExecution(name, argumentsJson, BUILTIN_SUBAGENT_TOOL_NAMES);

    if (execution.target === "mcp") {
      return this.mcpExecutor.run(execution);
    }

    return this.builtinExecutor.run(execution);
  }
}

export const DEFAULT_TOOL_EXECUTOR = new ToolExecutor();
