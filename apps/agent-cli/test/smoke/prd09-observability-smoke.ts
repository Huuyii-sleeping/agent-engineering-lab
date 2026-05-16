import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { replayTrace } from "../../src/observability/replay.js";
import { createSpanId, recordObservabilityEvent, withExecutionContext } from "../../src/observability/runtime.js";
import { runToolByName } from "../../src/tools/index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function asJson(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

async function cleanObservability(): Promise<void> {
  await rm(path.join(process.cwd(), ".observability"), { recursive: true, force: true }).catch(() => {});
}

async function main(): Promise<void> {
  await cleanObservability();

  const traceId = "trace_prd09_smoke";
  await recordObservabilityEvent("loop_start", { round: 1, latestUserInput: "smoke" }, { traceId });

  const readSpan = createSpanId();
  await recordObservabilityEvent(
    "tool_call",
    { toolName: "read_file", preview: "read_file README.md", argumentsJson: JSON.stringify({ path: "README.md" }) },
    { traceId, spanId: readSpan },
  );
  const readOutput = await withExecutionContext({ traceId, spanId: readSpan }, async () =>
    runToolByName("read_file", JSON.stringify({ path: "README.md" })),
  );
  await recordObservabilityEvent(
    "tool_result",
    { toolName: "read_file", durationMs: 1, ok: true, errorCode: null, outputSummary: readOutput },
    { traceId, spanId: readSpan },
  );

  const writeSpan = createSpanId();
  await recordObservabilityEvent(
    "tool_call",
    {
      toolName: "write_file",
      preview: "write_file tmp/prd09.txt",
      argumentsJson: JSON.stringify({ path: "tmp/prd09.txt", content: "hello" }),
    },
    { traceId, spanId: writeSpan },
  );
  const writeOutput = await withExecutionContext({ traceId, spanId: writeSpan }, async () =>
    runToolByName("write_file", JSON.stringify({ path: "tmp/prd09.txt", content: "hello" })),
  );
  const writeParsed = asJson(writeOutput);
  await recordObservabilityEvent(
    "tool_result",
    {
      toolName: "write_file",
      durationMs: 1,
      ok: writeParsed.ok !== false,
      errorCode: writeParsed.ok === false ? (writeParsed.error as { code?: string } | undefined)?.code ?? null : null,
      outputSummary: writeOutput,
    },
    { traceId, spanId: writeSpan },
  );
  await recordObservabilityEvent(
    "mcp_call",
    {
      toolName: "mcp__private_demo__echo",
      serverName: "private-demo",
      remoteTool: "echo",
      outputSummary: "authorization=Bearer top-secret-token",
    },
    { traceId },
  );

  const eventsPath = path.join(process.cwd(), ".observability", "events.jsonl");
  const metricsPath = path.join(process.cwd(), ".observability", "metrics.json");
  const eventsRaw = await readFile(eventsPath, "utf8");
  const metricsRaw = await readFile(metricsPath, "utf8");

  assert(eventsRaw.includes('"kind":"tool_call"'), "events should contain tool_call");
  assert(eventsRaw.includes('"trace_id":"trace_prd09_smoke"'), "events should contain smoke trace_id");
  assert(eventsRaw.includes("[mcp_tool]"), "events should redact mcp aliases");
  assert(eventsRaw.includes("[REDACTED_SECRET]"), "events should redact secret-like content");
  assert(!eventsRaw.includes("top-secret-token"), "events should not persist raw secret");

  const metrics = asJson(metricsRaw);
  assert(Number(metrics.toolCalls) >= 2, "metrics should count tool calls");
  assert(Number(metrics.toolFailures) >= 1, "metrics should count failed or blocked tool calls");

  const replayed = await replayTrace(traceId, true);
  assert(replayed.ok === true, "replay should succeed");
  assert(replayed.totalToolCalls === 2, "replay should see both tool calls");
  assert(replayed.blocked >= 1, "dry-run replay should block write side effect");

  console.log("PRD09_OBSERVABILITY_SMOKE_OK");
}

main().catch((error) => {
  console.error("PRD09_OBSERVABILITY_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
