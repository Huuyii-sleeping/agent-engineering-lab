import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentRuntimeState } from "../agent-loop.js";
import { runDeliveryValidation } from "../delivery.js";
import { runHooks } from "../hooks/index.js";
import { appendSystemMessages } from "./query-messages.js";

type FinalizeToolDrivenRoundOptions = {
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
  usedTodo: boolean;
  deliveryAutoRunEnabled: boolean;
};

type RunQueryStopStageOptions = {
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
  stopReason: string;
  stopToolCallCount: number;
};

export function finalizeAssistantOnlyRound(runtimeState: AgentRuntimeState): {
  stopReason: "assistant_response";
} {
  runtimeState.roundsWithoutTodo += 1;
  return {
    stopReason: "assistant_response",
  };
}

export async function finalizeToolDrivenRound(
  opts: FinalizeToolDrivenRoundOptions,
): Promise<{
  stopReason: "tool_calls_processed" | "auto_delivery_passed" | "auto_delivery_failed";
}> {
  let stopReason: "tool_calls_processed" | "auto_delivery_passed" | "auto_delivery_failed" = "tool_calls_processed";

  if (opts.deliveryAutoRunEnabled && opts.runtimeState.wroteWorkspaceFiles) {
    const report = await runDeliveryValidation({
      mode: "auto",
      changedPaths: [...opts.runtimeState.touchedPaths],
      traceId: opts.traceId,
    });
    const summary =
      report.summary.status === "passed"
        ? `Auto delivery validation passed (${report.summary.passedStages}/${report.summary.totalStages} stages passed).`
        : `Auto delivery validation failed at ${report.latestFailure?.stage ?? "unknown"}: ${report.latestFailure?.code ?? "UNKNOWN"}. ${report.latestFailure?.suggestion ?? ""}`.trim();
    opts.messages.push({
      role: "assistant",
      content: summary,
    });
    stopReason = report.summary.status === "passed" ? "auto_delivery_passed" : "auto_delivery_failed";
  }

  opts.runtimeState.roundsWithoutTodo = opts.usedTodo ? 0 : opts.runtimeState.roundsWithoutTodo + 1;
  return { stopReason };
}

export async function runQueryStopStage(opts: RunQueryStopStageOptions): Promise<void> {
  const stopHooks = await runHooks("Stop", {
    session_id: opts.runtimeState.sessionId,
    trace_id: opts.traceId,
    payload: {
      round: opts.runtimeState.roundCounter,
      outcome: opts.stopReason,
      tool_call_count: opts.stopToolCallCount,
    },
  });
  appendSystemMessages(opts.messages, stopHooks.messages);
}
