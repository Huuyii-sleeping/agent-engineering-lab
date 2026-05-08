import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { isReplayDryRun } from "../observability/runtime.js";
import { BASE_TOOLS, BASE_UNKNOWN_TOOL, previewBaseToolCall, runBaseToolByName } from "./base.js";
import { enforceSecurityGate } from "./security.js";
import {
  SUBAGENT_TOOLS,
  runSubagentClose,
  runSubagentList,
  runSubagentSend,
  runSubagentSpawn,
  runSubagentWait,
} from "./subagent.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

const UNKNOWN_TOOL = BASE_UNKNOWN_TOOL;

const TOOL_RUNTIME_ERROR = (message: string): string =>
  JSON.stringify({ ok: false, error: { code: "TOOL_RUNTIME_ERROR", message } });

const SUBAGENT_HANDLERS: Record<string, ToolHandler> = {
  subagent_spawn: async (args) => runSubagentSpawn(args.name),
  subagent_send: async (args) => runSubagentSend(args.agent_id, args.prompt),
  subagent_wait: async (args) => runSubagentWait(args.agent_id, args.timeout_ms),
  subagent_list: async () => runSubagentList(),
  subagent_close: async (args) => runSubagentClose(args.agent_id),
};

export const TOOLS: ChatCompletionTool[] = [...BASE_TOOLS, ...SUBAGENT_TOOLS];

function parseToolArgs(argumentsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argumentsJson || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function previewToolCall(name: string, argumentsJson: string): string {
  const basePreview = previewBaseToolCall(name, argumentsJson);
  if (basePreview !== name || name === "bash" || name === "task_get") {
    return basePreview;
  }
  const args = parseToolArgs(argumentsJson);
  if (typeof args.agent_id === "number") {
    return `${name} ${args.agent_id}`;
  }
  return name;
}

export async function runToolByName(name: string, argumentsJson: string): Promise<string> {
  const subagentHandler = SUBAGENT_HANDLERS[name];
  if (subagentHandler) {
    if (isReplayDryRun()) {
      return JSON.stringify({
        ok: false,
        error: { code: "REPLAY_DRY_RUN_BLOCKED", message: `replay dry-run blocked tool ${name}` },
      });
    }
    const args = parseToolArgs(argumentsJson);
    const gate = await enforceSecurityGate(name, args);
    if (!gate.ok) {
      return gate.blocked;
    }
    try {
      return await subagentHandler(args);
    } catch (error) {
      return TOOL_RUNTIME_ERROR(error instanceof Error ? error.message : String(error));
    }
  }

  const baseOutput = await runBaseToolByName(name, argumentsJson);
  return baseOutput === BASE_UNKNOWN_TOOL ? UNKNOWN_TOOL : baseOutput;
}
