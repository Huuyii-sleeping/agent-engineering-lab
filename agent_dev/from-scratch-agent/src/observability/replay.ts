import { readObservabilityEvents, recordObservabilityEvent, withExecutionContext } from "./runtime.js";
import { runToolByName } from "../tools/index.js";

type ReplayItemResult = {
  spanId: string;
  toolName: string;
  blocked: boolean;
  ok: boolean;
  output: string;
};

function asJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function replaySpanId(index: number): string {
  return `replay_span_${index + 1}`;
}

export async function replayTrace(
  traceId: string,
  dryRun = true,
): Promise<{
  ok: boolean;
  traceId: string;
  replayTraceId: string;
  totalToolCalls: number;
  replayed: number;
  blocked: number;
  results: ReplayItemResult[];
}> {
  const targetTraceId = String(traceId).trim();
  if (!targetTraceId) {
    return {
      ok: false,
      traceId: "",
      replayTraceId: "",
      totalToolCalls: 0,
      replayed: 0,
      blocked: 0,
      results: [],
    };
  }

  const events = await readObservabilityEvents(targetTraceId);
  const toolCalls = events.filter((event) => event.kind === "tool_call");
  const replayTraceId = `replay_${targetTraceId}`;
  const results: ReplayItemResult[] = [];
  let blockedCount = 0;

  await recordObservabilityEvent("replay_start", { sourceTraceId: targetTraceId, dryRun }, { traceId: replayTraceId });

  for (let index = 0; index < toolCalls.length; index += 1) {
    const event = toolCalls[index];
    const toolName = String(event.payload.toolName ?? "").trim();
    const argumentsJson = String(event.payload.argumentsJson ?? "{}");
    if (!toolName) {
      continue;
    }
    const spanId = replaySpanId(index);
    const output = await withExecutionContext(
      {
        traceId: replayTraceId,
        spanId,
        replayMode: dryRun ? "dry_run" : "live",
      },
      async () => runToolByName(toolName, argumentsJson),
    );
    const parsed = asJson(output);
    const blocked = (parsed?.error as { code?: string } | undefined)?.code === "REPLAY_DRY_RUN_BLOCKED";
    const ok = parsed?.ok !== false;
    if (blocked) {
      blockedCount += 1;
    }
    results.push({ spanId, toolName, blocked, ok, output });
    await recordObservabilityEvent(
      "replay_tool_result",
      {
        sourceTraceId: targetTraceId,
        toolName,
        blocked,
        ok,
        outputSummary: output,
      },
      { traceId: replayTraceId, spanId },
    );
  }

  await recordObservabilityEvent(
    "replay_complete",
    {
      sourceTraceId: targetTraceId,
      totalToolCalls: toolCalls.length,
      replayed: results.length,
      blocked: blockedCount,
      dryRun,
    },
    { traceId: replayTraceId },
  );

  return {
    ok: true,
    traceId: targetTraceId,
    replayTraceId,
    totalToolCalls: toolCalls.length,
    replayed: results.length,
    blocked: blockedCount,
    results,
  };
}
