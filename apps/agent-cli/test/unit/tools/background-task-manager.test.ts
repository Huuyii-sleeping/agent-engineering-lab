import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/observability/runtime.js", () => ({
  getExecutionContext: vi.fn(() => null),
  recordObservabilityEvent: vi.fn(async () => {}),
}));

import { recordObservabilityEvent } from "../../../src/observability/runtime.js";
import { BackgroundManager } from "../../../src/tools/background-task-manager.js";
import type {
  BackgroundProcessLike,
  BackgroundTaskRunnerLike,
  BackgroundStreamLike,
} from "../../../src/tools/background-task-runner.js";

class FakeStream extends EventEmitter implements BackgroundStreamLike {
  override on(event: "data", handler: (chunk: Buffer) => void): this {
    return super.on(event, handler);
  }
}

class FakeProcess extends EventEmitter implements BackgroundProcessLike {
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();

  override on(event: "error", handler: (error: unknown) => void): this;
  override on(event: "exit", handler: (code: number | null) => void): this;
  override on(event: "error" | "exit", handler: ((arg: unknown) => void) | ((arg: number | null) => void)): this {
    return super.on(event, handler as never);
  }
}

class FakeRunner implements BackgroundTaskRunnerLike {
  lastCommand = "";
  readonly process = new FakeProcess();

  run(command: string): BackgroundProcessLike {
    this.lastCommand = command;
    return this.process;
  }
}

afterEach(() => {
  vi.mocked(recordObservabilityEvent).mockClear();
});

describe("tools/background-task-manager", () => {
  it("tracks completed tasks and drains notifications", () => {
    const runner = new FakeRunner();
    const manager = new BackgroundManager(runner);

    const created = JSON.parse(manager.run("echo hi")) as { ok: boolean; taskId: number; status: string };
    expect(created).toMatchObject({ ok: true, taskId: 1, status: "running" });
    expect(runner.lastCommand).toBe("echo hi");

    runner.process.stdout.emit("data", Buffer.from("hello"));
    runner.process.stderr.emit("data", Buffer.from("warn"));
    runner.process.emit("exit", 0);

    const checked = JSON.parse(manager.check(1)) as { ok: boolean; task: { status: string; exitCode: number } };
    expect(checked).toMatchObject({ ok: true, task: { status: "completed", exitCode: 0 } });

    const notifications = manager.drainNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      taskId: 1,
      status: "completed",
      command: "echo hi",
      exitCode: 0,
      stdout: "hello",
      stderr: "warn",
    });
    expect(manager.drainNotifications()).toEqual([]);
    expect(vi.mocked(recordObservabilityEvent)).toHaveBeenCalled();
  });

  it("tracks failed tasks and validates query shape", () => {
    const runner = new FakeRunner();
    const manager = new BackgroundManager(runner);

    expect(JSON.parse(manager.run(""))).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGUMENT" },
    });

    JSON.parse(manager.run("bad command"));
    runner.process.stderr.emit("data", Buffer.from("boom"));
    runner.process.emit("error", new Error("spawn failed"));

    expect(JSON.parse(manager.check(1))).toMatchObject({
      ok: true,
      task: {
        status: "failed",
        exitCode: -1,
      },
    });
    expect(JSON.parse(manager.check(999))).toMatchObject({
      ok: false,
      error: { code: "TASK_NOT_FOUND" },
    });

    const all = JSON.parse(manager.check(undefined)) as { ok: boolean; tasks: Array<{ status: string }> };
    expect(all.ok).toBe(true);
    expect(all.tasks[0]?.status).toBe("failed");
  });
});
