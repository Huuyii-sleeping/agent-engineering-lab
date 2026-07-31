import type { AgentToolExecutionSummary } from "@orbit/runtime-contracts";
import type { MastraAgentChunk } from "../agents/execution-resolver.js";
import type { AgentRuntimeEventInput } from "../storage/event-journal.js";
import { redactMastraBoundaryValue } from "./redaction.js";

type ToolPayload = {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  error?: unknown;
  isError?: boolean;
  argsTextDelta?: string;
  text?: string;
};

function toolPayload(value: unknown): ToolPayload {
  return value && typeof value === "object" ? value as ToolPayload : {};
}

function toolChunkPayload(value: unknown): ToolPayload {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return toolPayload(record.payload ?? value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Mastra Agent chunk 到产品 AgentRuntimeEvent 的唯一映射器。 */
export class MastraAgentEventMapper {
  private readonly secrets: string[];
  private readonly summaries = new Map<string, AgentToolExecutionSummary>();

  constructor(options: { secrets?: string[] } = {}) {
    this.secrets = options.secrets ?? [];
  }

  map(chunk: MastraAgentChunk): AgentRuntimeEventInput[] {
    const payload = toolChunkPayload(chunk);
    if (chunk.type === "text-delta") {
      const delta = typeof payload.text === "string" ? payload.text : "";
      return delta ? [{
        type: "text.delta",
        delta: String(redactMastraBoundaryValue(delta, this.secrets)),
      }] : [];
    }
    if (chunk.type === "tool-call-delta") {
      return [{
        type: "tool.input.delta",
        callId: payload.toolCallId ?? "unknown-call",
        toolId: payload.toolName ?? "unknown-tool",
        delta: String(redactMastraBoundaryValue(payload.argsTextDelta ?? "", this.secrets)),
      }];
    }
    if (chunk.type === "tool-call") {
      return [{
        type: "tool.call",
        callId: payload.toolCallId ?? "unknown-call",
        toolId: payload.toolName ?? "unknown-tool",
        input: redactMastraBoundaryValue(payload.args, this.secrets),
      }];
    }
    if (chunk.type !== "tool-result" && chunk.type !== "tool-error") return [];

    const callId = payload.toolCallId ?? "unknown-call";
    const toolId = payload.toolName ?? "unknown-tool";
    const failed = chunk.type === "tool-error" || payload.isError === true;
    const summary: AgentToolExecutionSummary = {
      callId,
      toolId,
      status: failed ? "failed" : "succeeded",
      output: failed ? undefined : redactMastraBoundaryValue(payload.result, this.secrets),
      error: failed ? {
        code: "MASTRA_TOOL_EXECUTION_FAILED",
        message: String(redactMastraBoundaryValue(errorMessage(payload.error ?? payload.result), this.secrets)),
      } : undefined,
    };
    this.summaries.set(callId, summary);
    return [{ type: "tool.result", result: summary }];
  }

  toolExecutions(): AgentToolExecutionSummary[] {
    return [...this.summaries.values()].map((summary) => structuredClone(summary));
  }
}
