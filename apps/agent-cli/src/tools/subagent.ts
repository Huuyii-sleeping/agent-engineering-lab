import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { SubagentManager } from "./subagent-manager.js";
export type {
  SubagentExecutionResult,
  SubagentNotification,
  SubagentRecord,
  SubagentStatus,
} from "./subagent-types.js";
export { SubagentExecutor } from "./subagent-executor.js";
export { SubagentManager } from "./subagent-manager.js";

const SUBAGENTS = new SubagentManager();

export const SUBAGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "subagent_spawn",
      description: "Create a new subagent worker.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_send",
      description: "Send a text task to a subagent asynchronously.",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "integer" },
          prompt: { type: "string" },
        },
        required: ["agent_id", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_wait",
      description: "Wait for a subagent run to finish.",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "integer" },
          timeout_ms: { type: "integer" },
        },
        required: ["agent_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_list",
      description: "List current subagent states.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_close",
      description: "Close a subagent.",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "integer" },
        },
        required: ["agent_id"],
      },
    },
  },
];

export function drainSubagentNotifications() {
  return SUBAGENTS.drainNotifications();
}

export async function runSubagentSpawn(name: unknown): Promise<string> {
  return SUBAGENTS.spawn(name);
}

export async function runSubagentSend(agentId: unknown, prompt: unknown): Promise<string> {
  return SUBAGENTS.send(agentId, prompt);
}

export async function runSubagentWait(agentId: unknown, timeoutMs: unknown): Promise<string> {
  return SUBAGENTS.wait(agentId, timeoutMs);
}

export async function runSubagentList(): Promise<string> {
  return SUBAGENTS.list();
}

export async function runSubagentClose(agentId: unknown): Promise<string> {
  return SUBAGENTS.close(agentId);
}
