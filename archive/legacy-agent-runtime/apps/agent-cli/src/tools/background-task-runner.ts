import { spawn } from "node:child_process";
import * as process from "node:process";

export type BackgroundDataHandler = (chunk: Buffer) => void;
export type BackgroundErrorHandler = (error: unknown) => void;
export type BackgroundExitHandler = (code: number | null) => void;

export type BackgroundStreamLike = {
  on(event: "data", handler: BackgroundDataHandler): void;
};

export type BackgroundProcessLike = {
  stdout: BackgroundStreamLike;
  stderr: BackgroundStreamLike;
  on(event: "error", handler: BackgroundErrorHandler): void;
  on(event: "exit", handler: BackgroundExitHandler): void;
};

export type BackgroundTaskRunnerLike = {
  run(command: string): BackgroundProcessLike;
};

const EMPTY_STREAM: BackgroundStreamLike = {
  on(): void {},
};

export class BackgroundTaskRunner implements BackgroundTaskRunnerLike {
  run(command: string): BackgroundProcessLike {
    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      windowsHide: true,
    });

    return {
      stdout: child.stdout ?? EMPTY_STREAM,
      stderr: child.stderr ?? EMPTY_STREAM,
      on(event, handler): void {
        child.on(event, handler as never);
      },
    };
  }
}
