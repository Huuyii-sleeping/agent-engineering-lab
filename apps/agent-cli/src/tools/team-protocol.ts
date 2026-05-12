import { nowTimestampMs } from "../time.js";
import type { ProtocolType, TeamMessage, TeamRequest, Teammate } from "./team-types.js";
import { TEAM_SCHEMA_VERSION, makeRequestId } from "./team-types.js";

export function teammateById(teammates: Teammate[], teammateId: number): Teammate | null {
  return teammates.find((t) => t.id === teammateId) ?? null;
}

export function createDirectMessage(teammate: Teammate, content: string, from: string): TeamMessage {
  return {
    id: makeRequestId(),
    from,
    to: teammate.name,
    type: "message",
    content,
    createdAt: nowTimestampMs(),
  };
}

export function createBroadcastMessage(teammate: Teammate, content: string, from: string): TeamMessage {
  return {
    id: makeRequestId(),
    from,
    to: teammate.name,
    type: "broadcast",
    content,
    createdAt: nowTimestampMs(),
  };
}

export function createProtocolRequest(protocol: ProtocolType, teammate: Teammate, payload: string, from: string): TeamRequest {
  return {
    schemaVersion: TEAM_SCHEMA_VERSION,
    request_id: makeRequestId(),
    type: protocol,
    from,
    to: teammate.name,
    status: "pending",
    payload,
    updatedAt: nowTimestampMs(),
  };
}

export function createProtocolRequestMessage(request: TeamRequest): TeamMessage {
  const messageType = request.type === "shutdown_request" ? "shutdown_request" : "plan_approval";
  return {
    id: makeRequestId(),
    from: request.from,
    to: request.to,
    type: messageType,
    content: request.payload,
    request_id: request.request_id,
    createdAt: nowTimestampMs(),
  };
}

export function applyProtocolResponse(request: TeamRequest, approve: boolean): void {
  request.status = approve ? "approved" : "rejected";
  request.schemaVersion = TEAM_SCHEMA_VERSION;
  request.updatedAt = nowTimestampMs();
}

export function createProtocolResponseMessage(protocol: ProtocolType, request: TeamRequest, note: string, from: string): TeamMessage {
  const messageType = protocol === "shutdown_request" ? "shutdown_response" : "plan_approval_response";
  return {
    id: makeRequestId(),
    from,
    to: request.to,
    type: messageType,
    content: note || request.status,
    request_id: request.request_id,
    createdAt: nowTimestampMs(),
  };
}
