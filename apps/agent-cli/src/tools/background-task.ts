import { spawn } from "node:child_process";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getExecutionContext, recordObservabilityEvent } from "../observability/runtime.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { nowTimestampMs } from "../time.js";

type BackgroundStatus = "running" | "completed" | "failed";

type BackgroundTask = {
  id: number;
  command: string;
  status: BackgroundStatus;
  traceId: string | null;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type BackgroundNotification = {
  taskId: number;
  status: "completed" | "failed";
  command: string;
  finishedAt: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

function cut(text: string, max = RUNTIME_CONFIG.backgroundMaxOutputChars): string {
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
    finishedAt: task.finishedAt,
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
      traceId: getExecutionContext()?.traceId ?? null,
      startedAt: nowTimestampMs(),
      finishedAt: null,
      exitCode: null,
      stdout: "",
      stderr: "",
    };
    this.tasks.set(task.id, task);
    this.nextId += 1;
    void recordObservabilityEvent(
      "background_task",
      {
        phase: "started",
        taskId: task.id,
        command: task.command,
      },
      task.traceId ? { traceId: task.traceId } : undefined,
    );

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
      task.finishedAt = nowTimestampMs();
      task.exitCode = -1;
      task.stderr += `\n${String(error)}`;
      void recordObservabilityEvent(
        "background_task",
        {
          phase: "failed",
          taskId: task.id,
          command: task.command,
          exitCode: task.exitCode,
          stderr: cut(task.stderr),
        },
        task.traceId ? { traceId: task.traceId } : undefined,
      );
      this.notifications.push({
        taskId: task.id,
        status: "failed",
        command: task.command,
        finishedAt: task.finishedAt,
        exitCode: task.exitCode,
        stdout: cut(task.stdout),
        stderr: cut(task.stderr),
      });
    });
    child.on("exit", (code) => {
      task.finishedAt = nowTimestampMs();
      task.exitCode = code ?? 0;
      task.status = task.exitCode === 0 ? "completed" : "failed";
      void recordObservabilityEvent(
        "background_task",
        {
          phase: task.status,
          taskId: task.id,
          command: task.command,
          exitCode: task.exitCode,
          stdout: cut(task.stdout),
          stderr: cut(task.stderr),
        },
        task.traceId ? { traceId: task.traceId } : undefined,
      );
      this.notifications.push({
        taskId: task.id,
        status: task.status,
        command: task.command,
        finishedAt: task.finishedAt,
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
