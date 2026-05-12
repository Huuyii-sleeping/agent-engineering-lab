import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { nowTimestampMs, parseTimestampMs } from "../time.js";

type TeammateStatus = "working" | "idle" | "shutdown";
type RequestStatus = "pending" | "approved" | "rejected";
type ProtocolType = "shutdown_request" | "plan_approval";
const TEAM_SCHEMA_VERSION = 2;

type Teammate = {
  schemaVersion: number;
  id: number;
  name: string;
  status: TeammateStatus;
  updatedAt: number;
};

type TeamMessage = {
  id: string;
  from: string;
  to: string;
  type:
    | "message"
    | "broadcast"
    | "shutdown_request"
    | "shutdown_response"
    | "plan_approval"
    | "plan_approval_response";
  content: string;
  request_id?: string;
  createdAt: number;
};

type TeamRequest = {
  schemaVersion: number;
  request_id: string;
  type: ProtocolType;
  from: string;
  to: string;
  status: RequestStatus;
  payload: string;
  updatedAt: number;
};

export type TeamNotification = {
  teammateId: number;
  teammateName: string;
  messageType: TeamMessage["type"];
  from: string;
  requestId?: string;
  createdAt: number;
  content: string;
};

function makeRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class TeamManager {
  private readonly root = path.join(process.cwd(), ".team");
  private readonly inboxDir = path.join(this.root, "inbox");
  private readonly teammatesPath = path.join(this.root, "teammates.json");
  private readonly requestsPath = path.join(this.root, "requests.json");
  private readonly notifications: TeamNotification[] = [];
  private initPromise: Promise<void> | null = null;

  private async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(this.inboxDir, { recursive: true });
        await this.ensureJsonFile(this.teammatesPath, "[]\n");
        await this.ensureJsonFile(this.requestsPath, "[]\n");
      })();
    }
    await this.initPromise;
  }

  private async ensureJsonFile(filePath: string, defaultContent: string): Promise<void> {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await writeFile(filePath, defaultContent, "utf8");
    }
  }

  private async loadTeammates(): Promise<Teammate[]> {
    await this.ensureInit();
    const raw = await readFile(this.teammatesPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<Teammate>>;
    return parsed.map((item) => ({
      schemaVersion: Number.isInteger(Number(item.schemaVersion)) ? Number(item.schemaVersion) : 1,
      id: Number(item.id),
      name: String(item.name ?? ""),
      status:
        item.status === "working" || item.status === "idle" || item.status === "shutdown"
          ? item.status
          : "idle",
      updatedAt: parseTimestampMs(item.updatedAt, nowTimestampMs()),
    }));
  }

  private async saveTeammates(teammates: Teammate[]): Promise<void> {
    await writeFile(this.teammatesPath, `${JSON.stringify(teammates, null, 2)}\n`, "utf8");
  }

  private async loadRequests(): Promise<TeamRequest[]> {
    await this.ensureInit();
    const raw = await readFile(this.requestsPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<TeamRequest>>;
    return parsed.map((item) => ({
      schemaVersion: Number.isInteger(Number(item.schemaVersion)) ? Number(item.schemaVersion) : 1,
      request_id: String(item.request_id ?? ""),
      type:
        item.type === "shutdown_request" || item.type === "plan_approval"
          ? item.type
          : "plan_approval",
      from: String(item.from ?? "main"),
      to: String(item.to ?? ""),
      status:
        item.status === "pending" || item.status === "approved" || item.status === "rejected"
          ? item.status
          : "pending",
      payload: String(item.payload ?? ""),
      updatedAt: parseTimestampMs(item.updatedAt, nowTimestampMs()),
    }));
  }

  private async saveRequests(requests: TeamRequest[]): Promise<void> {
    await writeFile(this.requestsPath, `${JSON.stringify(requests, null, 2)}\n`, "utf8");
  }

  private inboxPath(teammateId: number): string {
    return path.join(this.inboxDir, `${teammateId}.jsonl`);
  }

  private teammateById(teammates: Teammate[], teammateId: number): Teammate | null {
    return teammates.find((t) => t.id === teammateId) ?? null;
  }

  private ok(data: Record<string, unknown>): string {
    return JSON.stringify({ ok: true, ...data }, null, 2);
  }

  private fail(code: string, message: string): string {
    return JSON.stringify({ ok: false, error: { code, message } }, null, 2);
  }

  private async deliverMessage(teammate: Teammate, message: TeamMessage): Promise<void> {
    await appendFile(this.inboxPath(teammate.id), `${JSON.stringify(message)}\n`, "utf8");
    this.notifications.push({
      teammateId: teammate.id,
      teammateName: teammate.name,
      messageType: message.type,
      from: message.from,
      requestId: message.request_id,
      createdAt: message.createdAt,
      content: message.content,
    });
  }

  async addTeammate(nameArg: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    if (!name) {
      return this.fail("INVALID_ARGUMENT", "team_add_teammate requires name");
    }
    const teammates = await this.loadTeammates();
    const newId = teammates.length === 0 ? 1 : Math.max(...teammates.map((t) => t.id)) + 1;
    const teammate: Teammate = {
      schemaVersion: TEAM_SCHEMA_VERSION,
      id: newId,
      name,
      status: "idle",
      updatedAt: nowTimestampMs(),
    };
    teammates.push(teammate);
    await this.saveTeammates(teammates);
    return this.ok({ teammate });
  }

  async setStatus(teammateIdArg: unknown, statusArg: unknown): Promise<string> {
    const teammateId = Number(teammateIdArg);
    const status = String(statusArg ?? "");
    if (!Number.isInteger(teammateId) || teammateId <= 0) {
      return this.fail("INVALID_ARGUMENT", "team_set_status requires positive teammate_id");
    }
    if (status !== "working" && status !== "idle" && status !== "shutdown") {
      return this.fail("INVALID_ARGUMENT", "status must be working|idle|shutdown");
    }
    const teammates = await this.loadTeammates();
    const teammate = this.teammateById(teammates, teammateId);
    if (!teammate) {
      return this.fail("TEAMMATE_NOT_FOUND", `teammate ${teammateId} not found`);
    }
    teammate.status = status as TeammateStatus;
    teammate.schemaVersion = TEAM_SCHEMA_VERSION;
    teammate.updatedAt = nowTimestampMs();
    await this.saveTeammates(teammates);
    return this.ok({ teammate });
  }

  async sendMessage(
    teammateIdArg: unknown,
    contentArg: unknown,
    fromArg: unknown,
  ): Promise<string> {
    const teammateId = Number(teammateIdArg);
    const content = String(contentArg ?? "").trim();
    const from = String(fromArg ?? "main");
    if (!Number.isInteger(teammateId) || teammateId <= 0) {
      return this.fail("INVALID_ARGUMENT", "team_message requires positive teammate_id");
    }
    if (!content) {
      return this.fail("INVALID_ARGUMENT", "team_message requires content");
    }
    const teammates = await this.loadTeammates();
    const teammate = this.teammateById(teammates, teammateId);
    if (!teammate) {
      return this.fail("TEAMMATE_NOT_FOUND", `teammate ${teammateId} not found`);
    }
    const message: TeamMessage = {
      id: makeRequestId(),
      from,
      to: teammate.name,
      type: "message",
      content,
      createdAt: nowTimestampMs(),
    };
    await this.deliverMessage(teammate, message);
    return this.ok({ delivered: 1, message });
  }

  async broadcast(contentArg: unknown, fromArg: unknown): Promise<string> {
    const content = String(contentArg ?? "").trim();
    const from = String(fromArg ?? "main");
    if (!content) {
      return this.fail("INVALID_ARGUMENT", "team_broadcast requires content");
    }
    const teammates = await this.loadTeammates();
    let delivered = 0;
    for (const teammate of teammates) {
      const message: TeamMessage = {
        id: makeRequestId(),
        from,
        to: teammate.name,
        type: "broadcast",
        content,
        createdAt: nowTimestampMs(),
      };
      await this.deliverMessage(teammate, message);
      delivered += 1;
    }
    return this.ok({ delivered });
  }

  async createProtocolRequest(
    protocol: ProtocolType,
    teammateIdArg: unknown,
    payloadArg: unknown,
    fromArg: unknown,
  ): Promise<string> {
    const teammateId = Number(teammateIdArg);
    const payload = String(payloadArg ?? "").trim();
    const from = String(fromArg ?? "main");
    if (!Number.isInteger(teammateId) || teammateId <= 0) {
      return this.fail("INVALID_ARGUMENT", "protocol request requires positive teammate_id");
    }
    if (!payload) {
      return this.fail("INVALID_ARGUMENT", "protocol request requires payload");
    }
    const teammates = await this.loadTeammates();
    const teammate = this.teammateById(teammates, teammateId);
    if (!teammate) {
      return this.fail("TEAMMATE_NOT_FOUND", `teammate ${teammateId} not found`);
    }

    const request: TeamRequest = {
      schemaVersion: TEAM_SCHEMA_VERSION,
      request_id: makeRequestId(),
      type: protocol,
      from,
      to: teammate.name,
      status: "pending",
      payload,
      updatedAt: nowTimestampMs(),
    };
    const requests = await this.loadRequests();
    requests.push(request);
    await this.saveRequests(requests);

    const messageType = protocol === "shutdown_request" ? "shutdown_request" : "plan_approval";
    const message: TeamMessage = {
      id: makeRequestId(),
      from,
      to: teammate.name,
      type: messageType,
      content: payload,
      request_id: request.request_id,
      createdAt: nowTimestampMs(),
    };
    await this.deliverMessage(teammate, message);
    return this.ok({ request, message });
  }

  async respondProtocolRequest(
    protocol: ProtocolType,
    requestIdArg: unknown,
    approveArg: unknown,
    noteArg: unknown,
    fromArg: unknown,
  ): Promise<string> {
    const requestId = String(requestIdArg ?? "").trim();
    const note = String(noteArg ?? "").trim();
    const from = String(fromArg ?? "main");
    const approve = Boolean(approveArg);
    if (!requestId) {
      return this.fail("INVALID_ARGUMENT", "response requires request_id");
    }

    const requests = await this.loadRequests();
    const request = requests.find((r) => r.request_id === requestId);
    if (!request) {
      return this.fail("REQUEST_NOT_FOUND", `request ${requestId} not found`);
    }
    if (request.type !== protocol) {
      return this.fail("REQUEST_TYPE_MISMATCH", `request ${requestId} is ${request.type}`);
    }
    if (request.status !== "pending") {
      return this.fail("REQUEST_NOT_PENDING", `request ${requestId} already ${request.status}`);
    }

    request.status = approve ? "approved" : "rejected";
    request.schemaVersion = TEAM_SCHEMA_VERSION;
    request.updatedAt = nowTimestampMs();
    await this.saveRequests(requests);

    const teammates = await this.loadTeammates();
    const target = teammates.find((t) => t.name === request.to);
    if (!target) {
      return this.fail("TEAMMATE_NOT_FOUND", `teammate ${request.to} not found`);
    }
    const messageType =
      protocol === "shutdown_request" ? "shutdown_response" : "plan_approval_response";
    const message: TeamMessage = {
      id: makeRequestId(),
      from,
      to: target.name,
      type: messageType,
      content: note || request.status,
      request_id: request.request_id,
      createdAt: nowTimestampMs(),
    };
    await this.deliverMessage(target, message);

    return this.ok({ request, message });
  }

  async listTeammates(): Promise<string> {
    const teammates = await this.loadTeammates();
    return this.ok({ teammates });
  }

  async readInbox(teammateIdArg: unknown): Promise<string> {
    const teammateId = Number(teammateIdArg);
    if (!Number.isInteger(teammateId) || teammateId <= 0) {
      return this.fail("INVALID_ARGUMENT", "team_read_inbox requires positive teammate_id");
    }
    const inbox = this.inboxPath(teammateId);
    const raw = await readFile(inbox, "utf8").catch(() => "");
    const messages = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return this.ok({ messages });
  }

  async listRequests(): Promise<string> {
    const requests = await this.loadRequests();
    return this.ok({ requests });
  }

  drainNotifications(): TeamNotification[] {
    const copy = [...this.notifications];
    this.notifications.length = 0;
    return copy;
  }
}

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

export async function runTeamMessage(
  teammateId: unknown,
  content: unknown,
  from: unknown,
): Promise<string> {
  return TEAM.sendMessage(teammateId, content, from);
}

export async function runTeamBroadcast(content: unknown, from: unknown): Promise<string> {
  return TEAM.broadcast(content, from);
}

export async function runTeamShutdownRequest(
  teammateId: unknown,
  payload: unknown,
  from: unknown,
): Promise<string> {
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

export async function runTeamPlanApprovalRequest(
  teammateId: unknown,
  payload: unknown,
  from: unknown,
): Promise<string> {
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
