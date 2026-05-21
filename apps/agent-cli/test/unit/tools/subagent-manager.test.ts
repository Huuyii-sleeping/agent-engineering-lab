import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/observability/runtime.js", () => ({
  getExecutionContext: vi.fn(() => ({ traceId: "trace-1" })),
  recordObservabilityEvent: vi.fn(async () => {}),
}));

import { recordObservabilityEvent } from "../../../src/observability/runtime.js";
import { SubagentManager } from "../../../src/tools/subagent-manager.js";
import type {
  SubagentExecutionResult,
} from "../../../src/tools/subagent-types.js";
import type { SubagentExecutorLike } from "../../../src/tools/subagent-executor.js";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

class FakeExecutor implements SubagentExecutorLike {
  readonly execute = vi.fn<(prompt: string, traceId?: string) => Promise<SubagentExecutionResult>>();
}

afterEach(() => {
  vi.mocked(recordObservabilityEvent).mockClear();
});

describe("tools/subagent-manager", () => {
  it("spawns and lists subagents with stable snapshots", async () => {
    const manager = new SubagentManager(new FakeExecutor());

    expect(JSON.parse(await manager.spawn("alpha", "coordinator"))).toMatchObject({
      ok: true,
      agent: {
        id: 1,
        name: "alpha",
        role: "coordinator",
        parentAgentId: null,
        status: "idle",
        lastInput: null,
        lastOutput: null,
        lastError: null,
      },
    });

    expect(JSON.parse(await manager.list())).toMatchObject({
      ok: true,
      agents: [
        {
          id: 1,
          name: "alpha",
          role: "coordinator",
          status: "idle",
        },
      ],
    });
  });

  it("keeps role metadata on notifications and child subagents", async () => {
    const executor = new FakeExecutor();
    executor.execute.mockResolvedValueOnce({ status: "completed", output: "done" });
    const manager = new SubagentManager(executor);

    await manager.spawn("parent", "coordinator");
    await manager.spawn("child", "worker", 1);
    await manager.send(2, "do task");
    await manager.wait(2, 50);

    expect(manager.drainNotifications()).toEqual([
      {
        agentId: 2,
        agentName: "child",
        role: "worker",
        status: "completed",
        updatedAt: expect.any(Number),
        output: "done",
      },
    ]);
  });

  it("enforces running and timeout semantics, then completes and drains notifications", async () => {
    const executor = new FakeExecutor();
    const deferred = createDeferred<SubagentExecutionResult>();
    executor.execute.mockReturnValueOnce(deferred.promise);
    const manager = new SubagentManager(executor);

    await manager.spawn("worker");

    expect(JSON.parse(await manager.send(1, "do task"))).toMatchObject({
      ok: true,
      accepted: true,
      agent: {
        id: 1,
        status: "running",
        lastInput: "do task",
      },
    });
    expect(executor.execute).toHaveBeenCalledWith("do task", "trace-1");

    expect(JSON.parse(await manager.send(1, "again"))).toMatchObject({
      ok: false,
      error: { code: "AGENT_BUSY" },
    });
    expect(JSON.parse(await manager.close(1))).toMatchObject({
      ok: false,
      error: { code: "AGENT_BUSY" },
    });
    expect(JSON.parse(await manager.wait(1, 5))).toMatchObject({
      ok: false,
      error: { code: "WAIT_TIMEOUT" },
      agent: { status: "running" },
    });

    deferred.resolve({ status: "completed", output: "done" });
    expect(JSON.parse(await manager.wait(1, 50))).toMatchObject({
      ok: true,
      agent: {
        id: 1,
        status: "completed",
        lastOutput: "done",
        lastError: null,
      },
    });

    const notifications = manager.drainNotifications();
    expect(notifications).toEqual([
      {
        agentId: 1,
        agentName: "worker",
        role: "worker",
        status: "completed",
        updatedAt: expect.any(Number),
        output: "done",
      },
    ]);
    expect(manager.drainNotifications()).toEqual([]);
    expect(vi.mocked(recordObservabilityEvent)).toHaveBeenCalledWith(
      "notification",
      expect.objectContaining({
        source: "subagent",
        agentId: 1,
        status: "completed",
        output: "done",
      }),
      { traceId: "trace-1" },
    );
  });

  it("returns failure, closed, invalid, and not-found responses without changing contracts", async () => {
    const executor = new FakeExecutor();
    executor.execute.mockResolvedValueOnce({ status: "failed", error: "boom" });
    const manager = new SubagentManager(executor);

    expect(JSON.parse(await manager.send(1, "missing"))).toMatchObject({
      ok: false,
      error: { code: "AGENT_NOT_FOUND" },
    });

    await manager.spawn("beta");

    expect(JSON.parse(await manager.send(1, ""))).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGUMENT" },
    });
    expect(JSON.parse(await manager.wait(1, 0))).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGUMENT" },
    });

    await manager.send(1, "fail task");
    expect(JSON.parse(await manager.wait(1, 50))).toMatchObject({
      ok: true,
      agent: {
        status: "failed",
        lastError: "boom",
      },
    });

    expect(manager.drainNotifications()).toEqual([
      {
        agentId: 1,
        agentName: "beta",
        role: "worker",
        status: "failed",
        updatedAt: expect.any(Number),
        error: "boom",
      },
    ]);

    expect(JSON.parse(await manager.close(1))).toMatchObject({
      ok: true,
      agent: { status: "closed" },
    });
    expect(JSON.parse(await manager.send(1, "after close"))).toMatchObject({
      ok: false,
      error: { code: "AGENT_CLOSED" },
    });
    expect(JSON.parse(await manager.close(999))).toMatchObject({
      ok: false,
      error: { code: "AGENT_NOT_FOUND" },
    });
  });
});
