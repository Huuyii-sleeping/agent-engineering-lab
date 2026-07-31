import { RUNTIME_CONFIG } from "../runtime-config.js";

export type BackgroundStatus = "running" | "completed" | "failed";

export type BackgroundTask = {
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

export type BackgroundNotification = {
  taskId: number;
  status: "completed" | "failed";
  command: string;
  finishedAt: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export function cutBackgroundOutput(text: string, max = RUNTIME_CONFIG.backgroundMaxOutputChars): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}...`;
}

export function taskSnapshot(task: BackgroundTask): Record<string, unknown> {
  return {
    id: task.id,
    command: task.command,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    exitCode: task.exitCode,
    stdout: cutBackgroundOutput(task.stdout),
    stderr: cutBackgroundOutput(task.stderr),
  };
}
