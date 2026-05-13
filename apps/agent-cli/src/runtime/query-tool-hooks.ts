import type { HookServiceLike } from "../services/index.js";
import type { AgentRuntimeState } from "./query-types.js";

export function makeHookBlockedOutput(reason: string | null): string {
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

export async function runPreToolUseHooks(input: {
  hookService: HookServiceLike;
  runtimeState: AgentRuntimeState;
  traceId: string;
  spanId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}) {
  return input.hookService.run("PreToolUse", {
    session_id: input.runtimeState.sessionId,
    trace_id: input.traceId,
    span_id: input.spanId,
    payload: {
      tool_name: input.toolName,
      tool_arguments: input.toolArgs,
    },
  });
}

export async function runPostToolUseHooks(input: {
  hookService: HookServiceLike;
  runtimeState: AgentRuntimeState;
  traceId: string;
  spanId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolOutput: string;
  toolOk: boolean;
  errorCode: string | null;
}) {
  return input.hookService.run("PostToolUse", {
    session_id: input.runtimeState.sessionId,
    trace_id: input.traceId,
    span_id: input.spanId,
    payload: {
      tool_name: input.toolName,
      tool_arguments: input.toolArgs,
      tool_output: input.toolOutput,
      tool_ok: input.toolOk,
      error_code: input.errorCode,
    },
  });
}
