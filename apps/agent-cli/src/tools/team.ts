import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { TeamManager } from "./team-manager.js";
import type { TeamNotification } from "./team-types.js";

export type { TeamNotification } from "./team-types.js";

const TEAM = new TeamManager();

export const TEAM_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "team_add_teammate",
      description: "Add a teammate to team registry.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_set_status",
      description: "Set teammate status: working|idle|shutdown.",
      parameters: {
        type: "object",
        properties: {
          teammate_id: { type: "integer" },
          status: { type: "string", enum: ["working", "idle", "shutdown"] },
        },
        required: ["teammate_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_message",
      description: "Send a direct message to a teammate inbox.",
      parameters: {
        type: "object",
        properties: {
          teammate_id: { type: "integer" },
          content: { type: "string" },
          from: { type: "string" },
        },
        required: ["teammate_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_broadcast",
      description: "Broadcast a message to all teammates.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          from: { type: "string" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_shutdown_request",
      description: "Create a shutdown request for a teammate.",
      parameters: {
        type: "object",
        properties: {
          teammate_id: { type: "integer" },
          payload: { type: "string" },
          from: { type: "string" },
        },
        required: ["teammate_id", "payload"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_shutdown_response",
      description: "Respond to shutdown request by request_id.",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
          approve: { type: "boolean" },
          note: { type: "string" },
          from: { type: "string" },
        },
        required: ["request_id", "approve"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_plan_approval_request",
      description: "Create a plan approval request for a teammate.",
      parameters: {
        type: "object",
        properties: {
          teammate_id: { type: "integer" },
          payload: { type: "string" },
          from: { type: "string" },
        },
        required: ["teammate_id", "payload"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_plan_approval_response",
      description: "Respond to plan approval request by request_id.",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
          approve: { type: "boolean" },
          note: { type: "string" },
          from: { type: "string" },
        },
        required: ["request_id", "approve"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_list_teammates",
      description: "List all teammates and statuses.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "team_read_inbox",
      description: "Read inbox messages for a teammate.",
      parameters: {
        type: "object",
        properties: { teammate_id: { type: "integer" } },
        required: ["teammate_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_list_requests",
      description: "List all protocol requests.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export function drainTeamNotifications(): TeamNotification[] {
  return TEAM.drainNotifications();
}

export async function runTeamAddTeammate(name: unknown): Promise<string> {
  return TEAM.addTeammate(name);
}

export async function runTeamSetStatus(teammateId: unknown, status: unknown): Promise<string> {
  return TEAM.setStatus(teammateId, status);
}

export async function runTeamMessage(teammateId: unknown, content: unknown, from: unknown): Promise<string> {
  return TEAM.sendMessage(teammateId, content, from);
}

export async function runTeamBroadcast(content: unknown, from: unknown): Promise<string> {
  return TEAM.broadcast(content, from);
}

export async function runTeamShutdownRequest(teammateId: unknown, payload: unknown, from: unknown): Promise<string> {
  return TEAM.createProtocolRequest("shutdown_request", teammateId, payload, from);
}

export async function runTeamShutdownResponse(
  requestId: unknown,
  approve: unknown,
  note: unknown,
  from: unknown,
): Promise<string> {
  return TEAM.respondProtocolRequest("shutdown_request", requestId, approve, note, from);
}

export async function runTeamPlanApprovalRequest(teammateId: unknown, payload: unknown, from: unknown): Promise<string> {
  return TEAM.createProtocolRequest("plan_approval", teammateId, payload, from);
}

export async function runTeamPlanApprovalResponse(
  requestId: unknown,
  approve: unknown,
  note: unknown,
  from: unknown,
): Promise<string> {
  return TEAM.respondProtocolRequest("plan_approval", requestId, approve, note, from);
}

export async function runTeamListTeammates(): Promise<string> {
  return TEAM.listTeammates();
}

export async function runTeamReadInbox(teammateId: unknown): Promise<string> {
  return TEAM.readInbox(teammateId);
}

export async function runTeamListRequests(): Promise<string> {
  return TEAM.listRequests();
}
