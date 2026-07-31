export type SubagentStatus = "idle" | "running" | "completed" | "failed" | "closed";
export type SubagentRole = "worker" | "coordinator" | "reviewer";

export type SubagentRecord = {
  id: number;
  name: string;
  role: SubagentRole;
  parentAgentId: number | null;
  status: SubagentStatus;
  traceId: string | null;
  createdAt: number;
  updatedAt: number;
  lastInput: string | null;
  lastOutput: string | null;
  lastError: string | null;
};

export type SubagentNotification = {
  agentId: number;
  agentName: string;
  role: SubagentRole;
  status: "completed" | "failed";
  updatedAt: number;
  output?: string | null;
  error?: string | null;
};

export type SubagentExecutionResult =
  | { status: "completed"; output: string }
  | { status: "failed"; error: string };

export function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...data }, null, 2);
}

export function err(code: string, message: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ ok: false, error: { code, message }, ...(extra ?? {}) }, null, 2);
}

export function subagentSnapshot(record: SubagentRecord): Record<string, unknown> {
  return {
    id: record.id,
    name: record.name,
    role: record.role,
    parentAgentId: record.parentAgentId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastInput: record.lastInput,
    lastOutput: record.lastOutput,
    lastError: record.lastError,
  };
}
