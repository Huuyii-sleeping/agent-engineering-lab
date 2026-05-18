import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { parseToolArgs } from "../runtime/tool-runtime.js";
import { BASE_TOOLS, previewBaseToolCall, resolveBaseToolHandler } from "./base.js";
import { isFunctionTool, toChatCompletionTool, type ToolExecutionProfile, type ToolRegistration } from "./protocol.js";
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

export type BuiltinToolRegistration = ToolRegistration & {
  target: "base" | "subagent";
};

const SUBAGENT_HANDLERS: Record<string, ToolHandler> = {
  subagent_spawn: async (args) => runSubagentSpawn(args.name),
  subagent_send: async (args) => runSubagentSend(args.agent_id, args.prompt),
  subagent_wait: async (args) => runSubagentWait(args.agent_id, args.timeout_ms),
  subagent_list: async () => runSubagentList(),
  subagent_close: async (args) => runSubagentClose(args.agent_id),
};

export const BUILTIN_SUBAGENT_TOOL_NAMES = new Set(Object.keys(SUBAGENT_HANDLERS));

const READ_ONLY_BASE_TOOLS = new Set([
  "read_file",
  "memory_search",
  "memory_list",
  "memory_explain",
  "memory_doctor",
  "task_list",
  "task_get",
  "estimate_tokens",
  "security_check",
  "security_list_approvals",
  "worktree_list",
  "team_list_teammates",
  "team_read_inbox",
  "team_list_requests",
  "check_background",
  "list_skills",
  "load_skill",
]);

const HIGH_RISK_BASE_TOOLS = new Set(["bash", "write_file", "edit_file", "worktree_remove", "worktree_closeout"]);

function executionProfileForBaseTool(name: string, allowDuringReplay: boolean): ToolExecutionProfile {
  const readOnly = READ_ONLY_BASE_TOOLS.has(name) || allowDuringReplay;
  const highRisk = HIGH_RISK_BASE_TOOLS.has(name);
  return {
    readOnly,
    mutatesWorkspace: !readOnly,
    parallelSafe: readOnly && !highRisk,
    riskLevel: highRisk ? "high" : readOnly ? "low" : "medium",
  };
}

function executionProfileForSubagentTool(name: string): ToolExecutionProfile {
  return {
    readOnly: name === "subagent_list",
    mutatesWorkspace: false,
    parallelSafe: false,
    riskLevel: name === "subagent_list" ? "low" : "medium",
  };
}

function buildBaseRegistrations(): BuiltinToolRegistration[] {
  return BASE_TOOLS.filter(isFunctionTool)
    .map((tool) => {
      const resolved = resolveBaseToolHandler(tool.function.name);
      return {
        name: tool.function.name,
        description: tool.function.description ?? "",
        parameters: (tool.function.parameters as Record<string, unknown> | undefined) ?? { type: "object", properties: {} },
        target: "base",
        allowDuringReplay: resolved?.allowDuringReplay ?? false,
        execution: executionProfileForBaseTool(tool.function.name, resolved?.allowDuringReplay ?? false),
      } satisfies BuiltinToolRegistration;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildSubagentRegistrations(): BuiltinToolRegistration[] {
  return SUBAGENT_TOOLS.filter(isFunctionTool)
    .map(
      (tool) =>
        ({
          name: tool.function.name,
          description: tool.function.description ?? "",
          parameters:
            (tool.function.parameters as Record<string, unknown> | undefined) ?? { type: "object", properties: {} },
          target: "subagent",
          allowDuringReplay: false,
          execution: executionProfileForSubagentTool(tool.function.name),
        }) satisfies BuiltinToolRegistration,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const BUILTIN_TOOL_REGISTRATIONS: BuiltinToolRegistration[] = [
  ...buildBaseRegistrations(),
  ...buildSubagentRegistrations(),
];

export const BUILTIN_TOOLS: ChatCompletionTool[] = BUILTIN_TOOL_REGISTRATIONS.map(toChatCompletionTool);

export function listBuiltinToolRegistrations(): BuiltinToolRegistration[] {
  return [...BUILTIN_TOOL_REGISTRATIONS];
}

export function isBuiltinSubagentTool(name: string): boolean {
  return BUILTIN_SUBAGENT_TOOL_NAMES.has(name);
}

export function resolveBuiltinToolRegistration(name: string): BuiltinToolRegistration | null {
  return BUILTIN_TOOL_REGISTRATIONS.find((tool) => tool.name === name) ?? null;
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
