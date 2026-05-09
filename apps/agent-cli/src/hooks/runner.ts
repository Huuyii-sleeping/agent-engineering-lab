import * as process from "node:process";
import { recordObservabilityEvent } from "../observability/runtime.js";
import { loadHooksConfig } from "./config.js";
import { runCommandHook } from "./command-hook.js";
import type { CommandHookDefinition, HookEventName, HookInvocation, HookRunResult } from "./types.js";

function matches(def: CommandHookDefinition, invocation: HookInvocation): boolean {
  if (!def.matcher?.tools || def.matcher.tools.length === 0) {
    return true;
  }
  const toolName = String(invocation.payload.tool_name ?? "").trim();
  if (!toolName) {
    return false;
  }
  return def.matcher.tools.includes(toolName);
}

export async function runHooks(event: HookEventName, invocation: Omit<HookInvocation, "event" | "cwd">): Promise<HookRunResult> {
  const config = await loadHooksConfig();
  const candidates = (config.hooks?.[event] ?? []).filter((def) =>
    matches(def, {
      event,
      cwd: process.cwd(),
      ...invocation,
    }),
  );

  const result: HookRunResult = {
    blocked: false,
    blockReason: null,
    messages: [],
    matched: candidates.length,
    executed: 0,
    errors: [],
  };

  for (const def of candidates) {
    result.executed += 1;
    const decision = await runCommandHook(def, { event, cwd: process.cwd(), ...invocation });
    await recordObservabilityEvent("hook_result", {
      event,
      hookType: def.type,
      command: def.command,
      action: decision.action,
    }, invocation.trace_id ? { traceId: invocation.trace_id, spanId: invocation.span_id } : undefined);

    if (decision.action === "block") {
      result.blocked = true;
      result.blockReason = decision.reason;
      return result;
    }
    if (decision.action === "append_message") {
      if (decision.message?.trim()) {
        result.messages.push(decision.message.trim());
      }
      if (decision.messages) {
        for (const item of decision.messages) {
          const text = item.trim();
          if (text) {
            result.messages.push(text);
          }
        }
      }
    }
  }

  return result;
}
