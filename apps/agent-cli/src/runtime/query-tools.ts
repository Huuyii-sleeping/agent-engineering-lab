import { appendSystemMessages } from "./query-messages.js";
import { markWriteSideEffect } from "./query-tool-results.js";
import { executeQueryFunctionToolCall } from "./query-tool-executor.js";
import { runPostToolUseHooks } from "./query-tool-hooks.js";
import { maybeAutoCompleteTaskFromTodo, syncActiveTaskState } from "./query-tool-task-sync.js";
import type { QueryFunctionToolCall, QueryToolStageResult, RunQueryToolStageOptions } from "./query-tool-types.js";

export type { QueryToolStageResult } from "./query-tool-types.js";

function isFunctionToolCall(toolCall: NonNullable<RunQueryToolStageOptions["message"]["tool_calls"]>[number]): toolCall is QueryFunctionToolCall {
  return toolCall.type === "function";
}

export async function runQueryToolStage(opts: RunQueryToolStageOptions): Promise<QueryToolStageResult> {
  const toolCalls = opts.message.tool_calls ?? [];
  let usedTodo = false;

  for (const toolCall of toolCalls) {
    if (!isFunctionToolCall(toolCall)) {
      continue;
    }

    const result = await executeQueryFunctionToolCall({
      toolCall,
      messages: opts.messages,
      runtimeState: opts.runtimeState,
      traceId: opts.traceId,
      toolService: opts.toolService,
      hookService: opts.hookService,
      observabilityService: opts.observabilityService,
    });

    if (result.blocked) {
      continue;
    }

    if (result.analyzed.ok) {
      markWriteSideEffect(opts.runtimeState, result.toolName, result.toolArgs);
    }
    const postToolHooks = await runPostToolUseHooks({
      hookService: opts.hookService,
      runtimeState: opts.runtimeState,
      traceId: opts.traceId,
      spanId: result.spanId,
      toolName: result.toolName,
      toolArgs: result.toolArgs,
      toolOutput: result.toolOutput,
      toolOk: result.analyzed.ok,
      errorCode: result.analyzed.errorCode,
    });
    appendSystemMessages(opts.messages, postToolHooks.messages);

    const todoUsed = await maybeAutoCompleteTaskFromTodo({
      runtimeState: opts.runtimeState,
      toolName: result.toolName,
      toolArgs: result.toolArgs,
      traceId: opts.traceId,
      toolService: opts.toolService,
      observabilityService: opts.observabilityService,
    });
    usedTodo = usedTodo || todoUsed;

    syncActiveTaskState({
      runtimeState: opts.runtimeState,
      toolName: result.toolName,
      toolArgs: result.toolArgs,
      toolOutput: result.toolOutput,
    });
  }

  return { usedTodo };
}
