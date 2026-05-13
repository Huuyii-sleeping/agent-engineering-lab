import { appendSystemMessages } from "./query-messages.js";
import type { RunQueryStopStageOptions } from "./query-finalization-types.js";

export async function runQueryStopHooks(opts: RunQueryStopStageOptions): Promise<void> {
  const stopHooks = await opts.hookService.run("Stop", {
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
