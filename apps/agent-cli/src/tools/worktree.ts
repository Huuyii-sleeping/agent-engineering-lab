import { exec } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { nowTimestampMs, parseTimestampMs } from "../time.js";
import { runTaskSyncWorktreeState } from "./task-board.js";

type WorktreeStatus = "created" | "entered" | "running" | "kept" | "removed";
type CloseoutAction = "keep" | "remove";
type WorktreeCloseout = {
  action: CloseoutAction;
  at: number;
  forced: boolean;
};

const WORKTREE_SCHEMA_VERSION = 3;

type WorktreeRecord = {
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

type WorktreeEvent = {
  schemaVersion: number;
  id: string;
  type: "create" | "enter" | "run" | "closeout";
  name: string;
  at: number;
  detail: string;
};

function normalizeCloseout(value: unknown): WorktreeCloseout | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const parsed = value as Partial<WorktreeCloseout>;
  if (parsed.action !== "keep" && parsed.action !== "remove") {
    return null;
  }
  return {
    action: parsed.action,
    at: Number.isFinite(Number(parsed.at)) ? Number(parsed.at) : nowTimestampMs(),
    forced: Boolean(parsed.forced),
  };
}

function previewCommand(command: string, max = 160): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max)}...`;
}

function validWorktreeName(name: string): boolean {
  return /^[A-Za-z0-9._-]{1,40}$/.test(name);
}

function execPromise(command: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(command, { cwd, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, code: error ? 1 : 0 });
    });
  });
}

class WorktreeManager {
  private readonly root = path.join(process.cwd(), ".worktrees");
  private readonly indexPath = path.join(this.root, "index.json");
  private readonly eventsPath = path.join(this.root, "events.jsonl");
  private initPromise: Promise<void> | null = null;

  private async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(this.root, { recursive: true });
        await this.ensureFile(this.indexPath, "[]\n");
        await this.ensureFile(this.eventsPath, "");
      })();
    }
    await this.initPromise;
  }

  private async ensureFile(filePath: string, initial: string): Promise<void> {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await writeFile(filePath, initial, "utf8");
    }
  }

  private async loadIndex(): Promise<WorktreeRecord[]> {
    await this.ensureInit();
    const raw = await readFile(this.indexPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<WorktreeRecord>>;
    return parsed.map((item) => ({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      name: String(item.name ?? ""),
      path: String(item.path ?? ""),
      status:
        item.status === "created" ||
          item.status === "entered" ||
          item.status === "running" ||
          item.status === "kept" ||
          item.status === "removed"
          ? item.status
          : "created",
      createdAt: parseTimestampMs(item.createdAt, nowTimestampMs()),
      updatedAt: parseTimestampMs(item.updatedAt, nowTimestampMs()),
      lastEnteredAt:
        item.lastEnteredAt === null || item.lastEnteredAt === undefined ? null : parseTimestampMs(item.lastEnteredAt, nowTimestampMs()),
      lastCommandAt:
        item.lastCommandAt === null || item.lastCommandAt === undefined ? null : parseTimestampMs(item.lastCommandAt, nowTimestampMs()),
      lastCommandPreview: item.lastCommandPreview ? String(item.lastCommandPreview) : null,
      closeout: normalizeCloseout(item.closeout),
    }));
  }

  private async saveIndex(records: WorktreeRecord[]): Promise<void> {
    await writeFile(this.indexPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  private async appendEvent(event: WorktreeEvent): Promise<void> {
    await writeFile(this.eventsPath, `${JSON.stringify(event)}\n`, { flag: "a", encoding: "utf8" });
  }

  private async isGitRepo(): Promise<boolean> {
    const result = await execPromise("git rev-parse --is-inside-work-tree", process.cwd());
    return result.code === 0 && result.stdout.trim() === "true";
  }

  private defaultPath(name: string): string {
    return path.join(this.root, name);
  }

  private async hasGitMetadata(cwd: string): Promise<boolean> {
    try {
      await access(path.join(cwd, ".git"));
      return true;
    } catch {
      return false;
    }
  }

  private async getDirtyFiles(record: WorktreeRecord): Promise<string[] | null> {
    if (!(await this.hasGitMetadata(record.path))) {
      return null;
    }
    const result = await execPromise("git status --short", record.path);
    if (result.code !== 0) {
      return null;
    }
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
  }

  private ok(data: Record<string, unknown>): string {
    return JSON.stringify({ ok: true, ...data }, null, 2);
  }

  private fail(code: string, message: string): string {
    return JSON.stringify({ ok: false, error: { code, message } }, null, 2);
  }

  async create(nameArg: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    if (!validWorktreeName(name)) {
      return this.fail("INVALID_WORKTREE_NAME", "name must match [A-Za-z0-9._-]{1,40}");
    }

    const records = await this.loadIndex();
    if (records.some((r) => r.name === name && r.status !== "removed")) {
      return this.fail("WORKTREE_EXISTS", `worktree ${name} exists`);
    }

    const targetPath = this.defaultPath(name);
    await mkdir(targetPath, { recursive: true });
    const now = nowTimestampMs();
    const record: WorktreeRecord = {
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      name,
      path: targetPath,
      status: "created",
      createdAt: now,
      updatedAt: now,
      lastEnteredAt: null,
      lastCommandAt: null,
      lastCommandPreview: null,
      closeout: null,
    };
    records.push(record);
    await this.saveIndex(records);
    await this.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "create",
      name,
      at: nowTimestampMs(),
      detail: (await this.isGitRepo()) ? "git_repo" : "workdir_fallback",
    });
    return this.ok({ worktree: record });
  }

  async list(): Promise<string> {
    const records = await this.loadIndex();
    return this.ok({ worktrees: records });
  }

  async enter(nameArg: unknown, taskIdArg?: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    if (!name) {
      return this.fail("INVALID_ARGUMENT", "worktree_enter requires name");
    }
    const records = await this.loadIndex();
    const record = records.find((r) => r.name === name && r.status !== "removed");
    if (!record) {
      return this.fail("WORKTREE_NOT_FOUND", `worktree ${name} not found`);
    }

    const now = nowTimestampMs();
    record.status = "entered";
    record.updatedAt = now;
    record.lastEnteredAt = now;
    record.closeout = null;
    record.schemaVersion = WORKTREE_SCHEMA_VERSION;
    await this.saveIndex(records);
    await this.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "enter",
      name,
      at: now,
      detail: "entered",
    });
    await runTaskSyncWorktreeState(name, "entered", taskIdArg);
    return this.ok({ worktree: record });
  }

  async run(nameArg: unknown, commandArg: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    const command = String(commandArg ?? "").trim();
    if (!name || !command) {
      return this.fail("INVALID_ARGUMENT", "worktree_run requires name and command");
    }
    const records = await this.loadIndex();
    const record = records.find((r) => r.name === name && r.status !== "removed");
    if (!record) {
      return this.fail("WORKTREE_NOT_FOUND", `worktree ${name} not found`);
    }
    const result = await execPromise(command, record.path);
    record.status = "running";
    record.schemaVersion = WORKTREE_SCHEMA_VERSION;
    record.updatedAt = nowTimestampMs();
    record.lastCommandAt = record.updatedAt;
    record.lastCommandPreview = previewCommand(command);
    record.closeout = null;
    await this.saveIndex(records);
    await this.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "run",
      name,
      at: nowTimestampMs(),
      detail: command,
    });
    await runTaskSyncWorktreeState(name, "running");
    return this.ok({
      worktree: record,
      exitCode: result.code,
      stdout: result.stdout.slice(0, 3000),
      stderr: result.stderr.slice(0, 3000),
    });
  }

  async closeout(nameArg: unknown, actionArg: unknown, taskIdArg?: unknown, forceArg?: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    const action = String(actionArg ?? "").trim();
    const force = Boolean(forceArg);
    if (!name || (action !== "keep" && action !== "remove")) {
      return this.fail("INVALID_ARGUMENT", "worktree_closeout requires name and action=keep|remove");
    }
    const records = await this.loadIndex();
    const record = records.find((r) => r.name === name && r.status !== "removed");
    if (!record) {
      return this.fail("WORKTREE_NOT_FOUND", `worktree ${name} not found`);
    }

    const dirtyFiles = action === "remove" ? await this.getDirtyFiles(record) : null;
    if (action === "remove" && dirtyFiles && dirtyFiles.length > 0 && !force) {
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

    if (action === "remove") {
      await rm(record.path, { recursive: true, force: true });
    }

    const now = nowTimestampMs();
    record.status = action === "keep" ? "kept" : "removed";
    record.schemaVersion = WORKTREE_SCHEMA_VERSION;
    record.updatedAt = now;
    record.closeout = {
      action: action as CloseoutAction,
      at: now,
      forced: force,
    };
    await this.saveIndex(records);
    await this.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "closeout",
      name,
      at: now,
      detail: JSON.stringify({ action, force, dirtyFiles: dirtyFiles ?? [] }),
    });
    await runTaskSyncWorktreeState(name, action === "keep" ? "kept" : "removed", taskIdArg, record.closeout);
    return this.ok({ worktree: record, closeout: record.closeout, dirtyFiles: dirtyFiles ?? [] });
  }

  async keep(nameArg: unknown, taskIdArg?: unknown): Promise<string> {
    return this.closeout(nameArg, "keep", taskIdArg, false);
  }

  async remove(nameArg: unknown, forceArg?: unknown, taskIdArg?: unknown): Promise<string> {
    return this.closeout(nameArg, "remove", taskIdArg, forceArg);
  }
}

const WORKTREES = new WorktreeManager();

export const WORKTREE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "worktree_create",
      description: "Create a worktree (or workdir fallback) by name.",
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
      name: "worktree_list",
      description: "List worktree records.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_enter",
      description: "Mark a worktree as the active execution lane and optionally sync a task binding.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          task_id: { type: "integer" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_run",
      description: "Run a command inside a worktree path.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          command: { type: "string" },
        },
        required: ["name", "command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_keep",
      description: "Close out a worktree by keeping it.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          task_id: { type: "integer" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_remove",
      description: "Close out a worktree by removing it; force can override dirty git guard.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          force: { type: "boolean" },
          task_id: { type: "integer" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_closeout",
      description: "Close out a worktree with action keep or remove and sync task/worktree lifecycle state.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          action: { type: "string", enum: ["keep", "remove"] },
          force: { type: "boolean" },
          task_id: { type: "integer" },
        },
        required: ["name", "action"],
      },
    },
  },
];

export async function runWorktreeCreate(name: unknown): Promise<string> {
  return WORKTREES.create(name);
}

export async function runWorktreeList(): Promise<string> {
  return WORKTREES.list();
}

export async function runWorktreeEnter(name: unknown, taskId?: unknown): Promise<string> {
  return WORKTREES.enter(name, taskId);
}

export async function runWorktreeRun(name: unknown, command: unknown): Promise<string> {
  return WORKTREES.run(name, command);
}

export async function runWorktreeKeep(name: unknown, taskId?: unknown): Promise<string> {
  return WORKTREES.keep(name, taskId);
}

export async function runWorktreeRemove(name: unknown, force?: unknown, taskId?: unknown): Promise<string> {
  return WORKTREES.remove(name, force, taskId);
}

export async function runWorktreeCloseout(
  name: unknown,
  action: unknown,
  force?: unknown,
  taskId?: unknown,
): Promise<string> {
  return WORKTREES.closeout(name, action, taskId, force);
}
