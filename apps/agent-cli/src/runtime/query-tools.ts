import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentRuntimeState } from "../agent-loop.js";
import { runHooks } from "../hooks/index.js";
import { createSpanId, recordObservabilityEvent, withExecutionContext } from "../observability/runtime.js";
import { previewToolCall, runToolByName } from "../tools/index.js";
import { appendSystemMessages } from "./query-messages.js";
import {
  analyzeToolOutput,
  isTodoCompletionRequest,
  markWriteSideEffect,
  parseTaskIdFromToolOutput,
} from "./query-tool-results.js";
import { parseToolArgs } from "./tool-runtime.js";

export type QueryToolStageResult = {
  usedTodo: boolean;
};

type RunQueryToolStageOptions = {
  message: OpenAI.Chat.Completions.ChatCompletionMessage;
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
};

function makeHookBlockedOutput(reason: string | null): string {
  return JSON.stringify(
    {
      ok: false,
      error: {
        code: "HOOK_BLOCKED",
        message: reason ?? "blocked by hook",
      },
    },
    null,
    2,
  );
}

async function maybeAutoCompleteTaskFromTodo(
  runtimeState: AgentRuntimeState,
  toolName: string,
  toolArgs: Record<string, unknown>,
  traceId: string,
): Promise<boolean> {
  if (toolName !== "todo") {
    return false;
  }
  if (!runtimeState.activeTaskId || !isTodoCompletionRequest(toolArgs)) {
    return true;
  }

  const autoUpdateArgs = JSON.stringify({
    task_id: runtimeState.activeTaskId,
    status: "completed",
  });
  console.log(`\u001b[33m$ task_update ${runtimeState.activeTaskId} (auto)\u001b[0m`);
  const autoOutput = await withExecutionContext({ traceId, spanId: createSpanId() }, async () =>
    runToolByName("task_update", autoUpdateArgs),
  );
  console.log(autoOutput);
  runtimeState.activeTaskId = null;
  return true;
}

function syncActiveTaskState(
  runtimeState: AgentRuntimeState,
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolOutput: string,
): void {
  if (toolName === "task_create") {
    const createdId = parseTaskIdFromToolOutput(toolOutput);
    if (createdId) {
      runtimeState.activeTaskId = createdId;
    }
    return;
  }

  if (toolName !== "task_update") {
    return;
  }

  const taskId = Number(toolArgs.task_id);
  const status = String(toolArgs.status ?? "");
  if (runtimeState.activeTaskId && taskId === runtimeState.activeTaskId && status === "completed") {
    runtimeState.activeTaskId = null;
  }
}

export async function runQueryToolStage(opts: RunQueryToolStageOptions): Promise<QueryToolStageResult> {
  const toolCalls = opts.message.tool_calls ?? [];
  let usedTodo = false;

  for (const toolCall of toolCalls) {
    if (toolCall.type !== "function") {
      continue;
    }

    const toolName = toolCall.function.name;
    const toolArgs = parseToolArgs(toolCall.function.arguments);
    const preview = previewToolCall(toolName, toolCall.function.arguments);
    const spanId = createSpanId();
    await recordObservabilityEvent(
      "tool_call",
      {
        toolName,
        preview,
        argumentsJson: toolCall.function.arguments,
      },
      { traceId: opts.traceId, spanId },
    );
    console.log(`\u001b[33m$ ${preview}\u001b[0m`);

    const preToolHooks = await runHooks("PreToolUse", {
      session_id: opts.runtimeState.sessionId,
      trace_id: opts.traceId,
      span_id: spanId,
      payload: {
        tool_name: toolName,
        tool_arguments: toolArgs,
      },
    });
    appendSystemMessages(opts.messages, preToolHooks.messages);

    let toolOutput = "";
    let durationMs = 0;
    if (preToolHooks.blocked) {
      toolOutput = makeHookBlockedOutput(preToolHooks.blockReason);
    } else {
      const startedAt = Date.now();
      toolOutput = await withExecutionContext({ traceId: opts.traceId, spanId }, async () =>
        runToolByName(toolName, toolCall.function.arguments),
      );
      durationMs = Date.now() - startedAt;
    }

    console.log(toolOutput);
    const analyzed = analyzeToolOutput(toolOutput);
    await recordObservabilityEvent(
      "tool_result",
      {
        toolName,
        durationMs,
        ok: analyzed.ok,
        errorCode: analyzed.errorCode,
        outputSummary: analyzed.summary,
      },
      { traceId: opts.traceId, spanId },
    );
    if (analyzed.errorCode?.startsWith("SECURITY_")) {
      await recordObservabilityEvent(
        "security_blocked",
        {
          toolName,
          errorCode: analyzed.errorCode,
        },
        { traceId: opts.traceId, spanId },
      );
    }

    opts.messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: toolOutput,
    });

    if (preToolHooks.blocked) {
      continue;
    }

    if (analyzed.ok) {
      markWriteSideEffect(opts.runtimeState, toolName, toolArgs);
    }
    const postToolHooks = await runHooks("PostToolUse", {
      session_id: opts.runtimeState.sessionId,
      trace_id: opts.traceId,
      span_id: spanId,
      payload: {
        tool_name: toolName,
        tool_arguments: toolArgs,
        tool_output: toolOutput,
        tool_ok: analyzed.ok,
        error_code: analyzed.errorCode,
      },
    });
    appendSystemMessages(opts.messages, postToolHooks.messages);

    if (toolName === "todo") {
      usedTodo = true;
      await maybeAutoCompleteTaskFromTodo(opts.runtimeState, toolName, toolArgs, opts.traceId);
    }

    syncActiveTaskState(opts.runtimeState, toolName, toolArgs, toolOutput);
  }

  return { usedTodo };
}
