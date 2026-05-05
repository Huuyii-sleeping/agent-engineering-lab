import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

type TaskStatus = "pending" | "in_progress" | "completed";

type Task = {
  id: number;
  subject: string;
  description: string;
  status: TaskStatus;
  blockedBy: number[];
  owner: string;
  worktree: string | null;
};

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

  private async load(taskId: number): Promise<Task> {
    const raw = await readFile(this.taskPath(taskId), "utf8").catch(() => "");
    if (!raw) {
      throw new Error(`task ${taskId} not found`);
    }
    const parsed = JSON.parse(raw) as Partial<Task>;
    return {
      id: Number(parsed.id),
      subject: String(parsed.subject ?? ""),
      description: String(parsed.description ?? ""),
      status: (parsed.status as TaskStatus) ?? "pending",
      blockedBy: Array.isArray(parsed.blockedBy) ? parsed.blockedBy.map((n) => Number(n)) : [],
      owner: String(parsed.owner ?? ""),
      worktree: parsed.worktree ? String(parsed.worktree) : null,
    };
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
      id: this.nextId,
      subject,
      description,
      status: "pending",
      blockedBy: [],
      owner: "",
      worktree: null,
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

  private async clearDependency(completedId: number): Promise<void> {
    const files = (await readdir(this.dir)).filter((f) => /^task_\d+\.json$/.test(f));
    for (const file of files) {
      const fullPath = path.join(this.dir, file);
      const task = JSON.parse(await readFile(fullPath, "utf8")) as Task;
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
    }

    await this.save(task);
    return JSON.stringify(task, null, 2);
  }

  async listAll(): Promise<string> {
    await this.ensureInit();
    const files = (await readdir(this.dir)).filter((f) => /^task_(\d+)\.json$/.test(f));
    files.sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));

    if (files.length === 0) {
      return "No tasks.";
    }

    const lines: string[] = [];
    for (const file of files) {
      const task = JSON.parse(await readFile(path.join(this.dir, file), "utf8")) as Task;
      const marker = task.status === "pending" ? "[ ]" : task.status === "in_progress" ? "[>]" : "[x]";
      const blocked = task.blockedBy.length > 0 ? ` blockedBy=${JSON.stringify(task.blockedBy)}` : "";
      const wt = task.worktree ? ` worktree=${task.worktree}` : "";
      lines.push(`${marker} #${task.id}: ${task.subject}${blocked}${wt}`);
    }
    return lines.join("\n");
  }

  async scanUnclaimedTasks(): Promise<string> {
    await this.ensureInit();
    const files = (await readdir(this.dir)).filter((f) => /^task_(\d+)\.json$/.test(f));
    const unclaimed: Task[] = [];
    for (const file of files) {
      const task = JSON.parse(await readFile(path.join(this.dir, file), "utf8")) as Task;
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
    task.owner = owner;
    if (task.status === "pending") {
      task.status = "in_progress";
    }
    await this.save(task);
    return JSON.stringify({ ok: true, task }, null, 2);
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
): Promise<string> {
  return TASKS.update(taskId, status, addBlockedBy, removeBlockedBy, worktree);
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
