import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { nowTimestampMs } from "../time.js";

type TaskStatus = "pending" | "in_progress" | "completed";
type WorktreeState = "none" | "bound" | "entered" | "running" | "kept" | "removed";
type CloseoutAction = "keep" | "remove";
type TaskCloseout = {
  action: CloseoutAction;
  at: number;
  forced: boolean;
};

const TASK_SCHEMA_VERSION = 3;

type Task = {
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

function normalizeWorktreeState(value: unknown, fallback: WorktreeState): WorktreeState {
  return value === "none" ||
    value === "bound" ||
    value === "entered" ||
    value === "running" ||
    value === "kept" ||
    value === "removed"
    ? value
    : fallback;
}

function normalizeCloseout(value: unknown): TaskCloseout | null {
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

function toTaskError(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } });
}

class TaskManager {
  private readonly dir: string;
  private nextId = 1;
  private initPromise: Promise<void> | null = null;

  constructor(tasksDir: string) {
    this.dir = tasksDir;
  }

  private taskPath(taskId: number): string {
    return path.join(this.dir, `task_${taskId}.json`);
  }

  private async maxId(): Promise<number> {
    const files = await readdir(this.dir).catch(() => []);
    const ids = files
      .map((f) => /^task_(\d+)\.json$/.exec(f)?.[1])
      .filter((v): v is string => Boolean(v))
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    return ids.length === 0 ? 0 : Math.max(...ids);
  }

  private async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(this.dir, { recursive: true });
        this.nextId = (await this.maxId()) + 1;
      })();
    }
    await this.initPromise;
  }

  private normalizeTask(parsed: Partial<Task>): Task {
    const worktree = parsed.worktree ? String(parsed.worktree) : null;
    const fallbackWorktreeState: WorktreeState = worktree ? "bound" : "none";
    return {
      schemaVersion: TASK_SCHEMA_VERSION,
      id: Number(parsed.id),
      subject: String(parsed.subject ?? ""),
      description: String(parsed.description ?? ""),
      status: (parsed.status as TaskStatus) ?? "pending",
      blockedBy: Array.isArray(parsed.blockedBy) ? parsed.blockedBy.map((n) => Number(n)) : [],
      owner: String(parsed.owner ?? ""),
      worktree,
      worktreeState: normalizeWorktreeState(parsed.worktreeState, fallbackWorktreeState),
      lastWorktree: parsed.lastWorktree ? String(parsed.lastWorktree) : worktree,
      closeout: normalizeCloseout(parsed.closeout),
    };
  }

  private async loadByPath(taskPath: string): Promise<Task> {
    const raw = await readFile(taskPath, "utf8").catch(() => "");
    if (!raw) {
      throw new Error(`task file ${taskPath} not found`);
    }
    return this.normalizeTask(JSON.parse(raw) as Partial<Task>);
  }

  private async load(taskId: number): Promise<Task> {
    try {
      return await this.loadByPath(this.taskPath(taskId));
    } catch {
      throw new Error(`task ${taskId} not found`);
    }
  }

  private async save(task: Task): Promise<void> {
    await writeFile(this.taskPath(task.id), `${JSON.stringify(task, null, 2)}\n`, "utf8");
  }

  async create(subjectArg: unknown, descriptionArg: unknown): Promise<string> {
    await this.ensureInit();
    const subject = String(subjectArg ?? "").trim();
    const description = String(descriptionArg ?? "");
    if (!subject) {
      return toTaskError("INVALID_ARGUMENT", "task_create requires subject");
    }
    const task: Task = {
      schemaVersion: TASK_SCHEMA_VERSION,
      id: this.nextId,
      subject,
      description,
      status: "pending",
      blockedBy: [],
      owner: "",
      worktree: null,
      worktreeState: "none",
      lastWorktree: null,
      closeout: null,
    };
    await this.save(task);
    this.nextId += 1;
    return JSON.stringify(task, null, 2);
  }

  async get(taskIdArg: unknown): Promise<string> {
    await this.ensureInit();
    const taskId = Number(taskIdArg);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return toTaskError("INVALID_ARGUMENT", "task_get requires positive task_id");
    }
    try {
      return JSON.stringify(await this.load(taskId), null, 2);
    } catch (error) {
      return toTaskError("TASK_NOT_FOUND", error instanceof Error ? error.message : String(error));
    }
  }

  private async allTasks(): Promise<Task[]> {
    const files = (await readdir(this.dir)).filter((f) => /^task_\d+\.json$/.test(f));
    const tasks = await Promise.all(files.map((file) => this.loadByPath(path.join(this.dir, file))));
    tasks.sort((a, b) => a.id - b.id);
    return tasks;
  }

  private async clearDependency(completedId: number): Promise<void> {
    const tasks = await this.allTasks();
    for (const task of tasks) {
      if (task.blockedBy.includes(completedId)) {
        task.blockedBy = task.blockedBy.filter((id) => id !== completedId);
        await this.save(task);
      }
    }
  }

  async update(
    taskIdArg: unknown,
    statusArg: unknown,
    addBlockedByArg: unknown,
    removeBlockedByArg: unknown,
    worktreeArg?: unknown,
    worktreeStateArg?: unknown,
    lastWorktreeArg?: unknown,
    closeoutArg?: unknown,
  ): Promise<string> {
    await this.ensureInit();
    const taskId = Number(taskIdArg);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return toTaskError("INVALID_ARGUMENT", "task_update requires positive task_id");
    }

    let task: Task;
    try {
      task = await this.load(taskId);
    } catch (error) {
      return toTaskError("TASK_NOT_FOUND", error instanceof Error ? error.message : String(error));
    }

    if (statusArg !== undefined) {
      const status = String(statusArg);
      if (status !== "pending" && status !== "in_progress" && status !== "completed") {
        return toTaskError("INVALID_ARGUMENT", `invalid status ${status}`);
      }
      if (task.status === "completed" && status !== "completed") {
        return toTaskError("INVALID_STATUS_TRANSITION", "completed task cannot transition back");
      }
      if (task.status === "in_progress" && status === "pending") {
        return toTaskError("INVALID_STATUS_TRANSITION", "in_progress task cannot transition to pending");
      }
      task.status = status as TaskStatus;
      if (status === "completed") {
        await this.clearDependency(taskId);
      }
    }

    const addBlockedBy = Array.isArray(addBlockedByArg)
      ? addBlockedByArg.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const removeBlockedBy = Array.isArray(removeBlockedByArg)
      ? removeBlockedByArg.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
      : [];

    if (addBlockedBy.length > 0) {
      task.blockedBy = Array.from(new Set([...task.blockedBy, ...addBlockedBy]));
    }
    if (removeBlockedBy.length > 0) {
      task.blockedBy = task.blockedBy.filter((id) => !removeBlockedBy.includes(id));
    }

    if (worktreeArg !== undefined) {
      const wt = String(worktreeArg ?? "").trim();
      task.worktree = wt || null;
      if (wt) {
        task.lastWorktree = wt;
        if (worktreeStateArg === undefined) {
          task.worktreeState = "bound";
        }
      } else if (worktreeStateArg === undefined) {
        task.worktreeState = "none";
      }
    }

    if (worktreeStateArg !== undefined) {
      const fallbackState: WorktreeState = task.worktree ? "bound" : "none";
      task.worktreeState = normalizeWorktreeState(worktreeStateArg, fallbackState);
    }

    if (lastWorktreeArg !== undefined) {
      const lastWorktree = String(lastWorktreeArg ?? "").trim();
      task.lastWorktree = lastWorktree || null;
    }

    if (closeoutArg !== undefined) {
      task.closeout = normalizeCloseout(closeoutArg);
    }
    task.schemaVersion = TASK_SCHEMA_VERSION;

    await this.save(task);
    return JSON.stringify(task, null, 2);
  }

  async listAll(): Promise<string> {
    await this.ensureInit();
    const tasks = await this.allTasks();
    if (tasks.length === 0) {
      return "No tasks.";
    }

    const lines: string[] = [];
    for (const task of tasks) {
      const marker = task.status === "pending" ? "[ ]" : task.status === "in_progress" ? "[>]" : "[x]";
      const blocked = task.blockedBy.length > 0 ? ` blockedBy=${JSON.stringify(task.blockedBy)}` : "";
      const wt = task.worktree ? ` worktree=${task.worktree}` : "";
      const lane = ` lane=${task.worktreeState}`;
      const last = task.lastWorktree ? ` last_worktree=${task.lastWorktree}` : "";
      const closeout = task.closeout
        ? ` closeout=${task.closeout.action}@${task.closeout.at}${task.closeout.forced ? ":forced" : ""}`
        : "";
      lines.push(`${marker} #${task.id}: ${task.subject}${blocked}${wt}${lane}${last}${closeout}`);
    }
    return lines.join("\n");
  }

  async scanUnclaimedTasks(): Promise<string> {
    await this.ensureInit();
    const tasks = await this.allTasks();
    const unclaimed: Task[] = [];
    for (const task of tasks) {
      const owner = String(task.owner ?? "").trim();
      if (!owner && task.status !== "completed") {
        unclaimed.push(task);
      }
    }
    unclaimed.sort((a, b) => a.id - b.id);
    return JSON.stringify({ ok: true, tasks: unclaimed }, null, 2);
  }

  async claimTask(taskIdArg: unknown, ownerArg: unknown): Promise<string> {
    await this.ensureInit();
    const taskId = Number(taskIdArg);
    const owner = String(ownerArg ?? "").trim();
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return toTaskError("INVALID_ARGUMENT", "claim_task requires positive task_id");
    }
    if (!owner) {
      return toTaskError("INVALID_ARGUMENT", "claim_task requires owner");
    }
    let task: Task;
    try {
      task = await this.load(taskId);
    } catch (error) {
      return toTaskError("TASK_NOT_FOUND", error instanceof Error ? error.message : String(error));
    }
    if (task.owner && task.owner !== owner) {
      return toTaskError("TASK_ALREADY_CLAIMED", `task ${taskId} already claimed by ${task.owner}`);
    }
    if (task.status === "completed") {
      return toTaskError("INVALID_STATUS_TRANSITION", `task ${taskId} is completed and cannot be claimed`);
    }
    task.owner = owner;
    if (task.status === "pending") {
      task.status = "in_progress";
    }
    task.schemaVersion = TASK_SCHEMA_VERSION;
    await this.save(task);
    return JSON.stringify({ ok: true, task }, null, 2);
  }

  async syncWorktreeState(
    worktreeNameArg: unknown,
    worktreeStateArg: unknown,
    taskIdArg?: unknown,
    closeoutArg?: unknown,
  ): Promise<string> {
    await this.ensureInit();
    const worktreeName = String(worktreeNameArg ?? "").trim();
    if (!worktreeName) {
      return toTaskError("INVALID_ARGUMENT", "worktree name is required");
    }
    const worktreeState = normalizeWorktreeState(worktreeStateArg, "none");
    const explicitTaskId = Number(taskIdArg);
    const tasks = await this.allTasks();
    const targets = Number.isInteger(explicitTaskId) && explicitTaskId > 0
      ? tasks.filter((task) => task.id === explicitTaskId)
      : tasks.filter((task) => task.worktree === worktreeName || task.lastWorktree === worktreeName);
    if (targets.length === 0) {
      return JSON.stringify({ ok: true, updated: [] }, null, 2);
    }

    const closeout = closeoutArg !== undefined ? normalizeCloseout(closeoutArg) : undefined;
    for (const task of targets) {
      task.lastWorktree = worktreeName;
      task.worktreeState = worktreeState;
      if (worktreeState === "removed" || worktreeState === "kept") {
        task.worktree = null;
      } else if (!task.worktree) {
        task.worktree = worktreeName;
      }
      if (closeout !== undefined) {
        task.closeout = closeout;
      }
      task.schemaVersion = TASK_SCHEMA_VERSION;
      await this.save(task);
    }

    return JSON.stringify(
      {
        ok: true,
        updated: targets.map((task) => ({
          id: task.id,
          worktree: task.worktree,
          worktreeState: task.worktreeState,
          lastWorktree: task.lastWorktree,
          closeout: task.closeout,
        })),
      },
      null,
      2,
    );
  }
}

const TASKS = new TaskManager(path.join(process.cwd(), ".tasks"));

export const TASK_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "task_create",
      description: "Create a task.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string" },
          description: { type: "string" },
        },
        required: ["subject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_update",
      description: "Update task status/dependencies/worktree.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          addBlockedBy: { type: "array", items: { type: "integer" } },
          removeBlockedBy: { type: "array", items: { type: "integer" } },
          worktree: { type: "string" },
          worktree_state: { type: "string", enum: ["none", "bound", "entered", "running", "kept", "removed"] },
          last_worktree: { type: "string" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_list",
      description: "List task summary.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "task_get",
      description: "Get task by id.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "integer" } },
        required: ["task_id"],
      },
    },
  },
];

export async function runTaskCreate(subject: unknown, description: unknown): Promise<string> {
  return TASKS.create(subject, description);
}

export async function runTaskUpdate(
  taskId: unknown,
  status: unknown,
  addBlockedBy: unknown,
  removeBlockedBy: unknown,
  worktree?: unknown,
  worktreeState?: unknown,
  lastWorktree?: unknown,
  closeout?: unknown,
): Promise<string> {
  return TASKS.update(taskId, status, addBlockedBy, removeBlockedBy, worktree, worktreeState, lastWorktree, closeout);
}

export async function runTaskList(): Promise<string> {
  return TASKS.listAll();
}

export async function runTaskGet(taskId: unknown): Promise<string> {
  return TASKS.get(taskId);
}

export async function runScanUnclaimedTasks(): Promise<string> {
  return TASKS.scanUnclaimedTasks();
}

export async function runClaimTask(taskId: unknown, owner: unknown): Promise<string> {
  return TASKS.claimTask(taskId, owner);
}

export async function runTaskSyncWorktreeState(
  worktreeName: unknown,
  worktreeState: unknown,
  taskId?: unknown,
  closeout?: unknown,
): Promise<string> {
  return TASKS.syncWorktreeState(worktreeName, worktreeState, taskId, closeout);
}
