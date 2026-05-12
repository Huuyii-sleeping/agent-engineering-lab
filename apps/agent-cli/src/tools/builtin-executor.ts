import { executeProtectedToolHandler, type ToolExecution } from "../runtime/tool-runtime.js";
import { BASE_UNKNOWN_TOOL } from "./base.js";
import { previewBuiltinToolCall, resolveBuiltinToolHandler } from "./registry.js";

export type BuiltinToolExecutorLike = {
  previewToolCall(name: string, argumentsJson: string): string;
  run(execution: ToolExecution): Promise<string>;
};

export class BuiltinToolExecutor implements BuiltinToolExecutorLike {
  previewToolCall(name: string, argumentsJson: string): string {
    return previewBuiltinToolCall(name, argumentsJson);
  }

  async run(execution: ToolExecution): Promise<string> {
    const builtinHandler = resolveBuiltinToolHandler(execution.name);
    if (!builtinHandler) {
      return BASE_UNKNOWN_TOOL;
    }
    return executeProtectedToolHandler({
      name: execution.name,
      args: execution.args,
      handler: builtinHandler.handler,
      allowDuringReplay: builtinHandler.allowDuringReplay,
    });
  }
}

export const DEFAULT_BUILTIN_TOOL_EXECUTOR = new BuiltinToolExecutor();
