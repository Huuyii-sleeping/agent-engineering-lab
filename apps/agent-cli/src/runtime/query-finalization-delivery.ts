import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { DeliveryReport } from "../delivery/index.js";
import type { DeliveryServiceLike } from "../services/index.js";
import type { AgentRuntimeState } from "./query-types.js";
import type { ToolDrivenStopReason } from "./query-finalization-types.js";

export function summarizeAutoDeliveryReport(report: DeliveryReport): string {
  return report.summary.status === "passed"
    ? `Auto delivery validation passed (${report.summary.passedStages}/${report.summary.totalStages} stages passed).`
    : `Auto delivery validation failed at ${report.latestFailure?.stage ?? "unknown"}: ${report.latestFailure?.code ?? "UNKNOWN"}. ${report.latestFailure?.suggestion ?? ""}`.trim();
}

export async function runAutoDeliveryFinalizer(input: {
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
  deliveryAutoRunEnabled: boolean;
  deliveryService: DeliveryServiceLike;
}): Promise<ToolDrivenStopReason> {
  if (!input.deliveryAutoRunEnabled || !input.runtimeState.wroteWorkspaceFiles) {
    return "tool_calls_processed";
  }

  const report = await input.deliveryService.runValidation({
    mode: "auto",
    changedPaths: [...input.runtimeState.touchedPaths],
    traceId: input.traceId,
  });
  input.messages.push({
    role: "assistant",
    content: summarizeAutoDeliveryReport(report),
  });
  return report.summary.status === "passed" ? "auto_delivery_passed" : "auto_delivery_failed";
}
