import path from "node:path";
import * as process from "node:process";
import { nowTimestampMs } from "../time.js";
import {
  applyProtocolResponse,
  createBroadcastMessage,
  createDirectMessage,
  createProtocolRequest,
  createProtocolRequestMessage,
  createProtocolResponseMessage,
  teammateById,
} from "./team-protocol.js";
import { TeamStore } from "./team-store.js";
import type { ProtocolType, TeamMessage, TeamNotification, Teammate } from "./team-types.js";
import { TEAM_SCHEMA_VERSION, fail, ok } from "./team-types.js";

export class TeamManager {
  private readonly store: TeamStore;
  private readonly notifications: TeamNotification[] = [];

  constructor(root = path.join(process.cwd(), ".team")) {
    this.store = new TeamStore(root);
  }

  private async deliverMessage(teammate: Teammate, message: TeamMessage): Promise<void> {
    await this.store.appendInboxMessage(teammate.id, message);
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
      return fail("INVALID_ARGUMENT", "team_add_teammate requires name");
    }
    const teammates = await this.store.loadTeammates();
    const newId = teammates.length === 0 ? 1 : Math.max(...teammates.map((t) => t.id)) + 1;
    const teammate = this.store.createTeammate(newId, name);
    teammates.push(teammate);
    await this.store.saveTeammates(teammates);
    return ok({ teammate });
  }

  async setStatus(teammateIdArg: unknown, statusArg: unknown): Promise<string> {
    const teammateId = Number(teammateIdArg);
    const status = String(statusArg ?? "");
    if (!Number.isInteger(teammateId) || teammateId <= 0) {
      return fail("INVALID_ARGUMENT", "team_set_status requires positive teammate_id");
    }
    if (status !== "working" && status !== "idle" && status !== "shutdown") {
      return fail("INVALID_ARGUMENT", "status must be working|idle|shutdown");
    }
    const teammates = await this.store.loadTeammates();
    const teammate = teammateById(teammates, teammateId);
    if (!teammate) {
      return fail("TEAMMATE_NOT_FOUND", `teammate ${teammateId} not found`);
    }
    teammate.status = status;
    teammate.schemaVersion = TEAM_SCHEMA_VERSION;
    teammate.updatedAt = nowTimestampMs();
    await this.store.saveTeammates(teammates);
    return ok({ teammate });
  }

  async sendMessage(teammateIdArg: unknown, contentArg: unknown, fromArg: unknown): Promise<string> {
    const teammateId = Number(teammateIdArg);
    const content = String(contentArg ?? "").trim();
    const from = String(fromArg ?? "main");
    if (!Number.isInteger(teammateId) || teammateId <= 0) {
      return fail("INVALID_ARGUMENT", "team_message requires positive teammate_id");
    }
    if (!content) {
      return fail("INVALID_ARGUMENT", "team_message requires content");
    }
    const teammates = await this.store.loadTeammates();
    const teammate = teammateById(teammates, teammateId);
    if (!teammate) {
      return fail("TEAMMATE_NOT_FOUND", `teammate ${teammateId} not found`);
    }
    const message = createDirectMessage(teammate, content, from);
    await this.deliverMessage(teammate, message);
    return ok({ delivered: 1, message });
  }

  async broadcast(contentArg: unknown, fromArg: unknown): Promise<string> {
    const content = String(contentArg ?? "").trim();
    const from = String(fromArg ?? "main");
    if (!content) {
      return fail("INVALID_ARGUMENT", "team_broadcast requires content");
    }
    const teammates = await this.store.loadTeammates();
    let delivered = 0;
    for (const teammate of teammates) {
      const message = createBroadcastMessage(teammate, content, from);
      await this.deliverMessage(teammate, message);
      delivered += 1;
    }
    return ok({ delivered });
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
      return fail("INVALID_ARGUMENT", "protocol request requires positive teammate_id");
    }
    if (!payload) {
      return fail("INVALID_ARGUMENT", "protocol request requires payload");
    }
    const teammates = await this.store.loadTeammates();
    const teammate = teammateById(teammates, teammateId);
    if (!teammate) {
      return fail("TEAMMATE_NOT_FOUND", `teammate ${teammateId} not found`);
    }

    const request = createProtocolRequest(protocol, teammate, payload, from);
    const requests = await this.store.loadRequests();
    requests.push(request);
    await this.store.saveRequests(requests);

    const message = createProtocolRequestMessage(request);
    await this.deliverMessage(teammate, message);
    return ok({ request, message });
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
      return fail("INVALID_ARGUMENT", "response requires request_id");
    }

    const requests = await this.store.loadRequests();
    const request = requests.find((r) => r.request_id === requestId);
    if (!request) {
      return fail("REQUEST_NOT_FOUND", `request ${requestId} not found`);
    }
    if (request.type !== protocol) {
      return fail("REQUEST_TYPE_MISMATCH", `request ${requestId} is ${request.type}`);
    }
    if (request.status !== "pending") {
      return fail("REQUEST_NOT_PENDING", `request ${requestId} already ${request.status}`);
    }

    applyProtocolResponse(request, approve);
    await this.store.saveRequests(requests);

    const teammates = await this.store.loadTeammates();
    const target = teammates.find((t) => t.name === request.to);
    if (!target) {
      return fail("TEAMMATE_NOT_FOUND", `teammate ${request.to} not found`);
    }
    const message = createProtocolResponseMessage(protocol, request, note, from);
    await this.deliverMessage(target, message);

    return ok({ request, message });
  }

  async listTeammates(): Promise<string> {
    const teammates = await this.store.loadTeammates();
    return ok({ teammates });
  }

  async readInbox(teammateIdArg: unknown): Promise<string> {
    const teammateId = Number(teammateIdArg);
    if (!Number.isInteger(teammateId) || teammateId <= 0) {
      return fail("INVALID_ARGUMENT", "team_read_inbox requires positive teammate_id");
    }
    const messages = await this.store.readInbox(teammateId);
    return ok({ messages });
  }

  async listRequests(): Promise<string> {
    const requests = await this.store.loadRequests();
    return ok({ requests });
  }

  drainNotifications(): TeamNotification[] {
    const copy = [...this.notifications];
    this.notifications.length = 0;
    return copy;
  }
}
