import { nowTimestampMs } from "../time.js";

export type WorktreeStatus = "created" | "entered" | "running" | "kept" | "removed";
export type CloseoutAction = "keep" | "remove";

export type WorktreeCloseout = {
  action: CloseoutAction;
  at: number;
  forced: boolean;
};

export const WORKTREE_SCHEMA_VERSION = 3;

export type WorktreeRecord = {
  schemaVersion: number;
  name: string;
  path: string;
  status: WorktreeStatus;
  createdAt: number;
  updatedAt: number;
  lastEnteredAt: number | null;
  lastCommandAt: number | null;
  lastCommandPreview: string | null;
  closeout: WorktreeCloseout | null;
};

export type WorktreeEvent = {
  schemaVersion: number;
  id: string;
  type: "create" | "enter" | "run" | "closeout";
  name: string;
  at: number;
  detail: string;
};

export type CommandResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export function makeWorktreeEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function previewCommand(command: string, max = 160): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max)}...`;
}

export function validWorktreeName(name: string): boolean {
  return /^[A-Za-z0-9._-]{1,40}$/.test(name);
}

export function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...data }, null, 2);
}

export function fail(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } }, null, 2);
}

export function dirtyWorktreeFailure(name: string, dirtyFiles: string[]): string {
  return JSON.stringify(
    {
      ok: false,
      error: {
        code: "DIRTY_WORKTREE",
        message: `worktree ${name} has uncommitted changes; use keep or force remove`,
      },
      dirtyFiles,
    },
    null,
    2,
  );
}

export function createWorktreeCloseout(action: CloseoutAction, force: boolean, at = nowTimestampMs()): WorktreeCloseout {
  return { action, at, forced: force };
}
