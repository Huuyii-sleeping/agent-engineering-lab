import { nowTimestampMs } from "../time.js";

export type TaskStatus = "pending" | "in_progress" | "completed";
export type WorktreeState = "none" | "bound" | "entered" | "running" | "kept" | "removed";
export type CloseoutAction = "keep" | "remove";

export type TaskCloseout = {
  action: CloseoutAction;
  at: number;
  forced: boolean;
};

export const TASK_SCHEMA_VERSION = 3;

export type Task = {
  schemaVersion: number;
  id: number;
  subject: string;
  description: string;
  status: TaskStatus;
  blockedBy: number[];
  owner: string;
  worktree: string | null;
  worktreeState: WorktreeState;
  lastWorktree: string | null;
  closeout: TaskCloseout | null;
};

export function normalizeWorktreeState(value: unknown, fallback: WorktreeState): WorktreeState {
  return value === "none" ||
    value === "bound" ||
    value === "entered" ||
    value === "running" ||
    value === "kept" ||
    value === "removed"
    ? value
    : fallback;
}

export function normalizeTaskCloseout(value: unknown): TaskCloseout | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const parsed = value as Partial<TaskCloseout>;
  if (parsed.action !== "keep" && parsed.action !== "remove") {
    return null;
  }
  return {
    action: parsed.action,
    at: Number.isFinite(Number(parsed.at)) ? Number(parsed.at) : nowTimestampMs(),
    forced: Boolean(parsed.forced),
  };
}

export function toTaskError(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } });
}
