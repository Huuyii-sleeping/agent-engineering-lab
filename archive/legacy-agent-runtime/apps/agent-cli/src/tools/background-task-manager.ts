import { getExecutionContext, recordObservabilityEvent } from "../observability/runtime.js";
import { nowTimestampMs } from "../time.js";
import {
  BackgroundTaskRunner,
  type BackgroundTaskRunnerLike,
} from "./background-task-runner.js";
import {
  cutBackgroundOutput,
  taskSnapshot,
  type BackgroundNotification,
  type BackgroundTask,
} from "./background-task-types.js";

function toError(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } }, null, 2);
}

export class BackgroundManager {
  private nextId = 1;
  private readonly tasks = new Map<number, BackgroundTask>();
  private readonly notifications: BackgroundNotification[] = [];

  constructor(private readonly runner: BackgroundTaskRunnerLike = new BackgroundTaskRunner()) {}

  run(commandArg: unknown): string {
    const command = String(commandArg ?? "").trim();
    if (!command) {
      return toError("INVALID_ARGUMENT", "background_run requires command");
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
      { phase: "started", taskId: task.id, command: task.command },
      task.traceId ? { traceId: task.traceId } : undefined,
    );

    const child = this.runner.run(command);
    child.stdout.on("data", (chunk) => {
      task.stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      task.stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      task.status = "failed";
      task.finishedAt = nowTimestampMs();
      task.exitCode = -1;
      task.stderr += `\n${String(error)}`;
      this.pushNotification(task);
    });
    child.on("exit", (code) => {
      task.finishedAt = nowTimestampMs();
      task.exitCode = code ?? 0;
      task.status = task.exitCode === 0 ? "completed" : "failed";
      this.pushNotification(task);
    });

    return JSON.stringify({ ok: true, taskId: task.id, status: task.status }, null, 2);
  }

  private pushNotification(task: BackgroundTask): void {
    const status = task.status === "running" ? "failed" : task.status;
    void recordObservabilityEvent(
      "background_task",
      {
        phase: status,
        taskId: task.id,
        command: task.command,
        exitCode: task.exitCode,
        stdout: cutBackgroundOutput(task.stdout),
        stderr: cutBackgroundOutput(task.stderr),
      },
      task.traceId ? { traceId: task.traceId } : undefined,
    );
    this.notifications.push({
      taskId: task.id,
      status,
      command: task.command,
      finishedAt: task.finishedAt ?? nowTimestampMs(),
      exitCode: task.exitCode,
      stdout: cutBackgroundOutput(task.stdout),
      stderr: cutBackgroundOutput(task.stderr),
    });
  }

  check(taskIdArg: unknown): string {
    if (taskIdArg === undefined || taskIdArg === null) {
      return JSON.stringify({ ok: true, tasks: Array.from(this.tasks.values()).map((task) => taskSnapshot(task)) }, null, 2);
    }

    const id = Number(taskIdArg);
    if (!Number.isInteger(id) || id <= 0) {
      return toError("INVALID_ARGUMENT", "task_id must be a positive integer");
    }
    const task = this.tasks.get(id);
    if (!task) {
      return toError("TASK_NOT_FOUND", `task ${id} not found`);
    }
    return JSON.stringify({ ok: true, task: taskSnapshot(task) }, null, 2);
  }

  drainNotifications(): BackgroundNotification[] {
    const drained = [...this.notifications];
    this.notifications.length = 0;
    return drained;
  }
}
