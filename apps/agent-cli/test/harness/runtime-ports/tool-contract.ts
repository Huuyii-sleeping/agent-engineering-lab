import { describe, expect, it } from "vitest";
import type {
  ExecuteToolCommand,
  ToolExecutionPort,
  ToolListContext,
} from "@orbit/runtime-contracts";

export type ToolExecutionContractFixture = {
  port: ToolExecutionPort;
  listContext: ToolListContext;
  allowedCommand: ExecuteToolCommand;
  deniedCommand: ExecuteToolCommand;
  abortCommand(signal: AbortSignal): ExecuteToolCommand;
  auditActions(): string[];
};

/** 为 Legacy 与 Mastra Tool Adapter 复用同一组治理契约断言。 */
export function defineToolExecutionPortContract(
  name: string,
  createFixture: () => Promise<ToolExecutionContractFixture> | ToolExecutionContractFixture,
): void {
  describe(`${name} ToolExecutionPort contract`, () => {
    it("保留 descriptor schema 并执行允许的 Tool", async () => {
      const { port, listContext, allowedCommand, auditActions } = await createFixture();
      const descriptors = await port.list(listContext);
      const result = await port.execute(allowedCommand);

      expect(descriptors[0]).toMatchObject({
        id: allowedCommand.toolId,
        inputSchema: { type: "object" },
      });
      expect(result).toMatchObject({ toolId: allowedCommand.toolId });
      expect(auditActions()).toContain("execute:succeeded");
    });

    it("将权限拒绝作为结构化错误上抛且不执行底层操作", async () => {
      const { port, deniedCommand, auditActions } = await createFixture();

      await expect(port.execute(deniedCommand)).rejects.toMatchObject({
        code: "TOOL_PERMISSION_DENIED",
      });
      expect(auditActions()).toContain("execute:denied");
    });

    it("向可取消执行器传播 AbortSignal", async () => {
      const { port, abortCommand } = await createFixture();
      const controller = new AbortController();
      const execution = port.execute(abortCommand(controller.signal));
      controller.abort();

      await expect(execution).rejects.toMatchObject({ code: "RUNTIME_CANCELLED" });
    });
  });
}
