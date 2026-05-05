import { exec } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

type WorktreeStatus = "created" | "running" | "kept" | "removed";
const WORKTREE_SCHEMA_VERSION = 2;

type WorktreeRecord = {
  schemaVersion: number;
  name: string;
  path: string;
  status: WorktreeStatus;
  createdAt: string;
  updatedAt: string;
};

type WorktreeEvent = {
  schemaVersion: number;
  id: string;
  type: "create" | "run" | "keep" | "remove";
  name: string;
  at: string;
  detail: string;
};

function nowIso(): string {
  return new Date().toISOString();
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
      schemaVersion: Number.isInteger(Number(item.schemaVersion)) ? Number(item.schemaVersion) : 1,
      name: String(item.name ?? ""),
      path: String(item.path ?? ""),
      status:
        item.status === "created" || item.status === "running" || item.status === "kept" || item.status === "removed"
          ? item.status
          : "created",
      createdAt: String(item.createdAt ?? nowIso()),
      updatedAt: String(item.updatedAt ?? nowIso()),
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
    const now = nowIso();
    const record: WorktreeRecord = {
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      name,
      path: targetPath,
      status: "created",
      createdAt: now,
      updatedAt: now,
    };
    records.push(record);
    await this.saveIndex(records);
    await this.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "create",
      name,
      at: nowIso(),
      detail: (await this.isGitRepo()) ? "git_repo" : "workdir_fallback",
    });
    return this.ok({ worktree: record });
  }

  async list(): Promise<string> {
    const records = await this.loadIndex();
    return this.ok({ worktrees: records });
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
    record.updatedAt = nowIso();
    await this.saveIndex(records);
    await this.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "run",
      name,
      at: nowIso(),
      detail: command,
    });
    return this.ok({
      worktree: record,
      exitCode: result.code,
      stdout: result.stdout.slice(0, 3000),
      stderr: result.stderr.slice(0, 3000),
    });
  }

  async keep(nameArg: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    const records = await this.loadIndex();
    const record = records.find((r) => r.name === name && r.status !== "removed");
    if (!record) {
      return this.fail("WORKTREE_NOT_FOUND", `worktree ${name} not found`);
    }
    record.status = "kept";
    record.schemaVersion = WORKTREE_SCHEMA_VERSION;
    record.updatedAt = nowIso();
    await this.saveIndex(records);
    await this.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "keep",
      name,
      at: nowIso(),
      detail: "mark kept",
    });
    return this.ok({ worktree: record });
  }

  async remove(nameArg: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    const records = await this.loadIndex();
    const record = records.find((r) => r.name === name && r.status !== "removed");
    if (!record) {
      return this.fail("WORKTREE_NOT_FOUND", `worktree ${name} not found`);
    }
    await rm(record.path, { recursive: true, force: true });
    record.status = "removed";
    record.schemaVersion = WORKTREE_SCHEMA_VERSION;
    record.updatedAt = nowIso();
    await this.saveIndex(records);
    await this.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "remove",
      name,
      at: nowIso(),
      detail: "removed",
    });
    return this.ok({ worktree: record });
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
      description: "Mark worktree as kept.",
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
      name: "worktree_remove",
      description: "Remove a worktree.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
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

export async function runWorktreeRun(name: unknown, command: unknown): Promise<string> {
  return WORKTREES.run(name, command);
}

export async function runWorktreeKeep(name: unknown): Promise<string> {
  return WORKTREES.keep(name);
}

export async function runWorktreeRemove(name: unknown): Promise<string> {
  return WORKTREES.remove(name);
}
