import { describe, expect, it } from "vitest";
import type {
  ResumeWorkflowRunCommand,
  StartWorkflowRunCommand,
  WorkflowRuntimePort,
} from "@orbit/runtime-contracts";

export type WorkflowRuntimeContractFixture = {
  port: WorkflowRuntimePort;
  startCommand: StartWorkflowRunCommand;
  waitingCommand: StartWorkflowRunCommand;
  seedRunningRun(): Promise<string>;
  resumeCommand(runId: string): ResumeWorkflowRunCommand;
};

async function collectEvents(port: WorkflowRuntimePort, runId: string, sinceId = 0) {
  const events = [];
  for await (const event of port.events({ runId, sinceId })) {
    events.push(event);
  }
  return events;
}

async function waitForStatus(
  port: WorkflowRuntimePort,
  runId: string,
  status: "waiting" | "succeeded",
) {
  const deadline = Date.now() + 1_000;
  while (Date.now() <= deadline) {
    const current = await port.get(runId);
    if (current?.status === status) return current;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Workflow run ${runId} 未在预期时间内进入 ${status}。`);
}

/** 为 Legacy 与 Mastra Workflow Adapter 复用同一组产品契约断言。 */
export function defineWorkflowRuntimePortContract(
  name: string,
  createFixture: () => Promise<WorkflowRuntimeContractFixture> | WorkflowRuntimeContractFixture,
): void {
  describe(`${name} WorkflowRuntimePort contract`, () => {
    it("覆盖 start、query、事件顺序与游标回放", async () => {
      const { port, startCommand } = await createFixture();
      const started = await port.start(startCommand);
      const queried = await port.get(started.id);
      const events = await collectEvents(port, started.id);
      const ids = events.map((event) => event.id);

      expect(queried).toMatchObject({ id: started.id });
      expect(ids).toEqual([...ids].sort((left, right) => left - right));
      expect(new Set(ids).size).toBe(ids.length);
      expect(events.at(-1)).toMatchObject({ type: "run.status", status: "succeeded" });

      const cursor = ids.at(-2) ?? 0;
      const replay = await collectEvents(port, started.id, cursor);
      expect(replay.every((event) => event.id > cursor)).toBe(true);
    });

    it("取消运行且终态不可逆", async () => {
      const { port, seedRunningRun } = await createFixture();
      const capabilities = await port.capabilities();
      const runId = await seedRunningRun();

      if (!capabilities.cancel) {
        await expect(port.cancel({ runId })).rejects.toMatchObject({
          code: "RUNTIME_CAPABILITY_UNSUPPORTED",
        });
        return;
      }
      const cancelled = await port.cancel({ runId, reason: "contract-test" });
      expect(cancelled.status).toBe("cancelled");
      await expect(port.cancel({ runId })).rejects.toMatchObject({
        code: "RUNTIME_TERMINAL_CONFLICT",
      });
    });

    it("恢复 waiting run 且禁止重复 resume", async () => {
      const { port, waitingCommand, resumeCommand } = await createFixture();
      const capabilities = await port.capabilities();
      if (!capabilities.resume) {
        const waiting = await port.start(waitingCommand);
        await expect(port.resume(resumeCommand(waiting.id))).rejects.toMatchObject({
          code: "RUNTIME_CAPABILITY_UNSUPPORTED",
        });
        return;
      }
      const started = await port.start(waitingCommand);
      const waiting = started.status === "waiting" ? started : await waitForStatus(port, started.id, "waiting");
      expect(waiting.status).toBe("waiting");

      const resumed = await port.resume(resumeCommand(waiting.id));
      expect(resumed.status).toBe("succeeded");
      await expect(port.resume(resumeCommand(waiting.id))).rejects.toMatchObject({
        code: "RUNTIME_TERMINAL_CONFLICT",
      });
    });
  });
}
