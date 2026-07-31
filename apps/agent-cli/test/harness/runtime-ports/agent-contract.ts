import { describe, expect, it } from "vitest";
import type {
  AgentRuntimePort,
  GenerateAgentCommand,
  StreamAgentCommand,
} from "@orbit/runtime-contracts";

export type AgentRuntimeContractFixture = {
  port: AgentRuntimePort;
  generateCommand: GenerateAgentCommand;
  streamCommand: StreamAgentCommand;
  seedRunningRun(): Promise<string>;
};

/** 为 Legacy 与 Mastra Agent Adapter 复用同一组产品契约断言。 */
export function defineAgentRuntimePortContract(
  name: string,
  createFixture: () => Promise<AgentRuntimeContractFixture> | AgentRuntimeContractFixture,
): void {
  describe(`${name} AgentRuntimePort contract`, () => {
    it("覆盖 generate、query、usage 与 Tool 摘要", async () => {
      const { port, generateCommand } = await createFixture();
      const capabilities = await port.capabilities();
      const result = await port.generate(generateCommand);
      const queried = await port.getRun(result.id);

      expect(result.status).toBe("succeeded");
      expect(result.text).toBeTruthy();
      if (capabilities.usage) {
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      } else {
        expect(result.usage).toBeUndefined();
      }
      if (capabilities.toolEvents) {
        expect(result.toolExecutions.length).toBeGreaterThan(0);
      }
      expect(queried).toMatchObject({ id: result.id, status: "succeeded" });
    });

    it("保持 stream 事件顺序、严格递增 id 与 final result", async () => {
      const { port, streamCommand } = await createFixture();
      const capabilities = await port.capabilities();
      const events = [];
      for await (const event of port.stream(streamCommand)) {
        events.push(event);
      }

      const ids = events.map((event) => event.id);
      const types = events.map((event) => event.type);
      expect(ids).toEqual([...ids].sort((left, right) => left - right));
      expect(new Set(ids).size).toBe(ids.length);
      expect(types).toContain("text.delta");
      if (capabilities.toolEvents) {
        expect(types.indexOf("text.delta")).toBeLessThan(types.indexOf("tool.call"));
        expect(types.indexOf("tool.call")).toBeLessThan(types.indexOf("tool.result"));
      }
      if (capabilities.usage) {
        expect(types).toContain("usage");
      }
      expect(types.at(-1)).toBe("run.final");
    });

    it("取消运行并保持 cancelled 终态", async () => {
      const { port, seedRunningRun } = await createFixture();
      const capabilities = await port.capabilities();
      const runId = await seedRunningRun();

      if (!capabilities.cancel) {
        await expect(port.cancel({ runId, reason: "contract-test" })).rejects.toMatchObject({
          code: "RUNTIME_CAPABILITY_UNSUPPORTED",
        });
        return;
      }
      const cancelled = await port.cancel({ runId, reason: "contract-test" });
      expect(cancelled.status).toBe("cancelled");
      await expect(port.getRun(runId)).resolves.toMatchObject({ status: "cancelled" });
    });
  });
}
