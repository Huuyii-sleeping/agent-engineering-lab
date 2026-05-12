export type TeammateStatus = "working" | "idle" | "shutdown";
export type RequestStatus = "pending" | "approved" | "rejected";
export type ProtocolType = "shutdown_request" | "plan_approval";

export const TEAM_SCHEMA_VERSION = 2;

export type Teammate = {
  schemaVersion: number;
  id: number;
  name: string;
  status: TeammateStatus;
  updatedAt: number;
};

export type TeamMessage = {
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

export type TeamRequest = {
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

export function makeRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...data }, null, 2);
}

export function fail(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } }, null, 2);
}
