import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { HookServiceLike, ObservabilityServiceLike } from "../services/index.js";
import type { ToolServiceLike } from "../tools/service.js";
import { renderCliEvent } from "../cli-ui.js";
import { appendSystemMessages } from "./query-messages.js";
import { analyzeToolOutput } from "./query-tool-results.js";
import { makeHookBlockedOutput, runPreToolUseHooks } from "./query-tool-hooks.js";
import type { AgentRuntimeState } from "./query-types.js";
import type { QueryFunctionToolCall, QueryToolExecutionResult } from "./query-tool-types.js";
import { parseToolArgs } from "./tool-runtime.js";

export async function executeQueryFunctionToolCall(input: {
  toolCall: QueryFunctionToolCall;
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
  toolService: ToolServiceLike;
  hookService: HookServiceLike;
  observabilityService: ObservabilityServiceLike;
}): Promise<QueryToolExecutionResult> {
  const toolName = input.toolCall.function.name;
  const toolArgs = parseToolArgs(input.toolCall.function.arguments);
  const preview = input.toolService.previewToolCall(toolName, input.toolCall.function.arguments);
  const spanId = input.observabilityService.createSpanId();
  await input.observabilityService.recordEvent(
    "tool_call",
    {
      toolName,
      preview,
      argumentsJson: input.toolCall.function.arguments,
    },
    { traceId: input.traceId, spanId },
  );
  console.log(
    renderCliEvent({
      kind: "tool",
      status: "running",
      title: toolName,
      detail: preview,
    }),
  );

  const preToolHooks = await runPreToolUseHooks({
    hookService: input.hookService,
    runtimeState: input.runtimeState,
    traceId: input.traceId,
    spanId,
    toolName,
    toolArgs,
  });
  appendSystemMessages(input.messages, preToolHooks.messages);

  let toolOutput = "";
  let durationMs = 0;
  if (preToolHooks.blocked) {
    toolOutput = makeHookBlockedOutput(preToolHooks.blockReason);
  } else {
    const startedAt = Date.now();
    toolOutput = await input.observabilityService.withExecutionContext({ traceId: input.traceId, spanId }, async () =>
      input.toolService.runToolByName(toolName, input.toolCall.function.arguments),
    );
    durationMs = Date.now() - startedAt;
  }

  const analyzed = analyzeToolOutput(toolOutput);
  console.log(
    renderCliEvent({
      kind: analyzed.errorCode?.startsWith("SECURITY_") ? "approval" : "tool",
      status: preToolHooks.blocked ? "blocked" : analyzed.ok ? "done" : "failed",
      title: toolName,
      detail: analyzed.summary,
      durationMs,
    }),
  );
  await input.observabilityService.recordEvent(
    "tool_result",
    {
      toolName,
      durationMs,
      ok: analyzed.ok,
      errorCode: analyzed.errorCode,
      outputSummary: analyzed.summary,
    },
    { traceId: input.traceId, spanId },
  );
  if (analyzed.errorCode?.startsWith("SECURITY_")) {
    await input.observabilityService.recordEvent(
      "security_blocked",
      {
        toolName,
        errorCode: analyzed.errorCode,
      },
      { traceId: input.traceId, spanId },
    );
  }

  input.messages.push({
    role: "tool",
    tool_call_id: input.toolCall.id,
    content: toolOutput,
  });

  return {
    toolName,
    toolArgs,
    toolOutput,
    analyzed,
    blocked: preToolHooks.blocked,
    spanId,
  };
}
