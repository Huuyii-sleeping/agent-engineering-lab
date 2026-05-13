import type { AgentRuntimeState } from "./query-types.js";
import { runAutoDeliveryFinalizer } from "./query-finalization-delivery.js";
import { finalizeAssistantRoundCounter, updateToolDrivenRoundCounter } from "./query-finalization-rounds.js";
import { runQueryStopHooks } from "./query-finalization-stop.js";
import type {
  FinalizeToolDrivenRoundOptions,
  RunQueryStopStageOptions,
  ToolDrivenStopReason,
} from "./query-finalization-types.js";

export function finalizeAssistantOnlyRound(runtimeState: AgentRuntimeState): {
  stopReason: "assistant_response";
} {
  return finalizeAssistantRoundCounter(runtimeState);
}

export async function finalizeToolDrivenRound(
  opts: FinalizeToolDrivenRoundOptions,
): Promise<{
  stopReason: ToolDrivenStopReason;
}> {
  const stopReason = await runAutoDeliveryFinalizer({
    messages: opts.messages,
    runtimeState: opts.runtimeState,
    traceId: opts.traceId,
    deliveryAutoRunEnabled: opts.deliveryAutoRunEnabled,
    deliveryService: opts.deliveryService,
  });

  updateToolDrivenRoundCounter(opts.runtimeState, opts.usedTodo);
  return { stopReason };
}

export async function runQueryStopStage(opts: RunQueryStopStageOptions): Promise<void> {
  await runQueryStopHooks(opts);
}
