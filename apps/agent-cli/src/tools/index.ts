import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { executeProtectedToolHandler, parseToolArgs, resolveToolExecution } from "../runtime/tool-runtime.js";
import { BASE_TOOLS, BASE_UNKNOWN_TOOL, previewBaseToolCall, runBaseToolByName } from "./base.js";
import { listMcpTools, runMcpToolByName } from "./mcp.js";
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

const SUBAGENT_HANDLERS: Record<string, ToolHandler> = {
  subagent_spawn: async (args) => runSubagentSpawn(args.name),
  subagent_send: async (args) => runSubagentSend(args.agent_id, args.prompt),
  subagent_wait: async (args) => runSubagentWait(args.agent_id, args.timeout_ms),
  subagent_list: async () => runSubagentList(),
  subagent_close: async (args) => runSubagentClose(args.agent_id),
};

export const TOOLS: ChatCompletionTool[] = [...BASE_TOOLS, ...SUBAGENT_TOOLS];

export async function listTools(): Promise<ChatCompletionTool[]> {
  return [...TOOLS, ...(await listMcpTools())];
}
const SUBAGENT_TOOL_NAMES = new Set(Object.keys(SUBAGENT_HANDLERS));

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
  const execution = resolveToolExecution(name, argumentsJson, SUBAGENT_TOOL_NAMES);

  if (execution.target === "subagent") {
    const subagentHandler = SUBAGENT_HANDLERS[execution.name];
    if (!subagentHandler) {
      return UNKNOWN_TOOL;
    }
    return executeProtectedToolHandler({
      name: execution.name,
      args: execution.args,
      handler: subagentHandler,
    });
  }

  if (execution.target === "mcp") {
    return executeProtectedToolHandler({
      name: execution.name,
      args: execution.args,
      handler: async (args) => {
        const mcpOutput = await runMcpToolByName(execution.name, args);
        return mcpOutput ?? UNKNOWN_TOOL;
      },
    });
  }

  const baseOutput = await runBaseToolByName(name, argumentsJson);
  return baseOutput === BASE_UNKNOWN_TOOL ? UNKNOWN_TOOL : baseOutput;
}
