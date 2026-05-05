import { spawn } from "node:child_process";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

type BackgroundStatus = "running" | "completed" | "failed";

type BackgroundTask = {
  id: number;
  command: string;
  status: BackgroundStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type BackgroundNotification = {
  taskId: number;
  status: "completed" | "failed";
  command: string;
  finishedAt: string;
  finishedAtLocal: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

const MAX_OUTPUT = 4_000;

function nowIso(): string {
  return new Date().toISOString();
}

function toShanghaiTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}

function cut(text: string, max = MAX_OUTPUT): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}...`;
}

function taskSnapshot(task: BackgroundTask): Record<string, unknown> {
  return {
    id: task.id,
    command: task.command,
    status: task.status,
    startedAt: task.startedAt,
    startedAtLocal: toShanghaiTime(task.startedAt),
    finishedAt: task.finishedAt,
    finishedAtLocal: task.finishedAt ? toShanghaiTime(task.finishedAt) : null,
    exitCode: task.exitCode,
    stdout: cut(task.stdout),
    stderr: cut(task.stderr),
  };
}

class BackgroundManager {
  private nextId = 1;
  private readonly tasks = new Map<number, BackgroundTask>();
  private readonly notifications: BackgroundNotification[] = [];

  run(commandArg: unknown): string {
    const command = String(commandArg ?? "").trim();
    if (!command) {
      return JSON.stringify(
        { ok: false, error: { code: "INVALID_ARGUMENT", message: "background_run requires command" } },
        null,
        2,
      );
    }

    const task: BackgroundTask = {
      id: this.nextId,
      command,
      status: "running",
      startedAt: nowIso(),
      finishedAt: null,
      exitCode: null,
      stdout: "",
      stderr: "",
    };
    this.tasks.set(task.id, task);
    this.nextId += 1;

    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      windowsHide: true,
    });

    child.stdout.on("data", (chunk: Buffer) => {
      task.stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      task.stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      task.status = "failed";
      task.finishedAt = nowIso();
      task.exitCode = -1;
      task.stderr += `\n${String(error)}`;
      this.notifications.push({
        taskId: task.id,
        status: "failed",
        command: task.command,
        finishedAt: task.finishedAt,
        finishedAtLocal: toShanghaiTime(task.finishedAt),
        exitCode: task.exitCode,
        stdout: cut(task.stdout),
        stderr: cut(task.stderr),
      });
    });
    child.on("exit", (code) => {
      task.finishedAt = nowIso();
      task.exitCode = code ?? 0;
      task.status = task.exitCode === 0 ? "completed" : "failed";
      this.notifications.push({
        taskId: task.id,
        status: task.status,
        command: task.command,
        finishedAt: task.finishedAt,
        finishedAtLocal: toShanghaiTime(task.finishedAt),
        exitCode: task.exitCode,
        stdout: cut(task.stdout),
        stderr: cut(task.stderr),
      });
    });

    return JSON.stringify({ ok: true, taskId: task.id, status: task.status }, null, 2);
  }

  check(taskIdArg: unknown): string {
    if (taskIdArg === undefined || taskIdArg === null) {
      const all = Array.from(this.tasks.values()).map((task) => taskSnapshot(task));
      return JSON.stringify({ ok: true, tasks: all }, null, 2);
    }

    const id = Number(taskIdArg);
    if (!Number.isInteger(id) || id <= 0) {
      return JSON.stringify(
        { ok: false, error: { code: "INVALID_ARGUMENT", message: "task_id must be a positive integer" } },
        null,
        2,
      );
    }
    const task = this.tasks.get(id);
    if (!task) {
      return JSON.stringify({ ok: false, error: { code: "TASK_NOT_FOUND", message: `task ${id} not found` } }, null, 2);
    }
    return JSON.stringify({ ok: true, task: taskSnapshot(task) }, null, 2);
  }

  drainNotifications(): BackgroundNotification[] {
    const copy = [...this.notifications];
    this.notifications.length = 0;
    return copy;
  }
}

const BACKGROUND = new BackgroundManager();

export const BACKGROUND_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "background_run",
      description: "Run a shell command in background and return task id immediately.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_background",
      description: "Check background task status; omit task_id to list all tasks.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
        },
      },
    },
  },
];

export async function runBackgroundRun(command: unknown): Promise<string> {
  return BACKGROUND.run(command);
}

export async function runCheckBackground(taskId: unknown): Promise<string> {
  return BACKGROUND.check(taskId);
}

export function drainBackgroundNotifications(): BackgroundNotification[] {
  return BACKGROUND.drainNotifications();
}
