import {
  createToolInputParseError,
  createToolInputValidationError,
  executeProtectedToolHandler,
  validateToolInput,
  type ToolExecution,
} from "../runtime/tool-runtime.js";
import { BASE_UNKNOWN_TOOL } from "./base.js";
import { previewBuiltinToolCall, resolveBuiltinToolHandler, resolveBuiltinToolRegistration } from "./registry.js";

export type BuiltinToolExecutorLike = {
  previewToolCall(name: string, argumentsJson: string): string;
  run(execution: ToolExecution): Promise<string>;
};

export class BuiltinToolExecutor implements BuiltinToolExecutorLike {
  previewToolCall(name: string, argumentsJson: string): string {
    return previewBuiltinToolCall(name, argumentsJson);
  }

  async run(execution: ToolExecution): Promise<string> {
    if (execution.parseError) {
      return createToolInputParseError(execution.name, execution.parseError);
    }
    const builtinHandler = resolveBuiltinToolHandler(execution.name);
    if (!builtinHandler) {
      return BASE_UNKNOWN_TOOL;
    }
    const registration = resolveBuiltinToolRegistration(execution.name);
    const errors = validateToolInput(registration?.parameters, execution.args);
    if (errors.length > 0) {
      return createToolInputValidationError(execution.name, errors);
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
