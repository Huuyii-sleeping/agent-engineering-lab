import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { parseToolArgs } from "../runtime/tool-runtime.js";
import { BASE_TOOLS, previewBaseToolCall, resolveBaseToolHandler } from "./base.js";
import {
  SUBAGENT_TOOLS,
  runSubagentClose,
  runSubagentList,
  runSubagentSend,
  runSubagentSpawn,
  runSubagentWait,
} from "./subagent.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export type BuiltinToolHandler = {
  handler: ToolHandler;
  allowDuringReplay: boolean;
};

const SUBAGENT_HANDLERS: Record<string, ToolHandler> = {
  subagent_spawn: async (args) => runSubagentSpawn(args.name),
  subagent_send: async (args) => runSubagentSend(args.agent_id, args.prompt),
  subagent_wait: async (args) => runSubagentWait(args.agent_id, args.timeout_ms),
  subagent_list: async () => runSubagentList(),
  subagent_close: async (args) => runSubagentClose(args.agent_id),
};

export const BUILTIN_SUBAGENT_TOOL_NAMES = new Set(Object.keys(SUBAGENT_HANDLERS));

export const BUILTIN_TOOLS: ChatCompletionTool[] = [...BASE_TOOLS, ...SUBAGENT_TOOLS];

export function isBuiltinSubagentTool(name: string): boolean {
  return BUILTIN_SUBAGENT_TOOL_NAMES.has(name);
}

export function previewBuiltinToolCall(name: string, argumentsJson: string): string {
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

export function resolveBuiltinToolHandler(name: string): BuiltinToolHandler | null {
  const subagentHandler = SUBAGENT_HANDLERS[name];
  if (subagentHandler) {
    return {
      handler: subagentHandler,
      allowDuringReplay: false,
    };
  }
  return resolveBaseToolHandler(name);
}
