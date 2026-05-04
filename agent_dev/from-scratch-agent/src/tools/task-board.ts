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
      throw new Error(`任务 ${taskId} 未找到`);
    }
    return JSON.parse(raw) as Task;
  }

  private async save(task: Task): Promise<void> {
    await writeFile(this.taskPath(task.id), `${JSON.stringify(task, null, 2)}\n`, "utf8");
  }

  async create(subjectArg: unknown, descriptionArg: unknown): Promise<string> {
    await this.ensureInit();
    const subject = String(subjectArg ?? "").trim();
    const description = String(descriptionArg ?? "");
    if (!subject) {
      return toTaskError("INVALID_ARGUMENT", "task_create 需要 subject");
    }
    const task: Task = {
      id: this.nextId,
      subject,
      description,
      status: "pending",
      blockedBy: [],
      owner: "",
    };
    await this.save(task);
    this.nextId += 1;
    return JSON.stringify(task, null, 2);
  }

  async get(taskIdArg: unknown): Promise<string> {
    await this.ensureInit();
    const taskId = Number(taskIdArg);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return toTaskError("INVALID_ARGUMENT", "task_get 需要正整数 task_id");
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
  ): Promise<string> {
    await this.ensureInit();
    const taskId = Number(taskIdArg);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return toTaskError("INVALID_ARGUMENT", "task_update 需要正整数 task_id");
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
        return toTaskError("INVALID_ARGUMENT", `无效状态: ${status}`);
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

    await this.save(task);
    return JSON.stringify(task, null, 2);
  }

  async listAll(): Promise<string> {
    await this.ensureInit();
    const files = (await readdir(this.dir)).filter((f) => /^task_(\d+)\.json$/.test(f));
    files.sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));

    if (files.length === 0) {
      return "暂无任务。";
    }

    const lines: string[] = [];
    for (const file of files) {
      const task = JSON.parse(await readFile(path.join(this.dir, file), "utf8")) as Task;
      const marker = task.status === "pending" ? "[ ]" : task.status === "in_progress" ? "[>]" : "[x]";
      const blocked = task.blockedBy.length > 0 ? ` (被阻塞: ${JSON.stringify(task.blockedBy)})` : "";
      lines.push(`${marker} #${task.id}: ${task.subject}${blocked}`);
    }
    return lines.join("\n");
  }
}

const TASKS = new TaskManager(path.join(process.cwd(), ".tasks"));

export const TASK_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "task_create",
      description: "创建一个新任务。",
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
      description: "更新任务状态或依赖关系。",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          addBlockedBy: { type: "array", items: { type: "integer" } },
          removeBlockedBy: { type: "array", items: { type: "integer" } },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_list",
      description: "列出所有任务摘要。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "task_get",
      description: "按 ID 获取任务详情。",
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
): Promise<string> {
  return TASKS.update(taskId, status, addBlockedBy, removeBlockedBy);
}

export async function runTaskList(): Promise<string> {
  return TASKS.listAll();
}

export async function runTaskGet(taskId: unknown): Promise<string> {
  return TASKS.get(taskId);
}
