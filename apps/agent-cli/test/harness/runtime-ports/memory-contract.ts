import { describe, expect, it } from "vitest";
import type { MemoryOwnership, MemoryRuntimePort } from "@orbit/runtime-contracts";

export type MemoryRuntimeContractFixture = {
  port: MemoryRuntimePort;
  ownerA: MemoryOwnership;
  ownerB: MemoryOwnership;
};

/** 为 Legacy 与 Mastra Memory Adapter 复用同一组隔离契约断言。 */
export function defineMemoryRuntimePortContract(
  name: string,
  createFixture: () => Promise<MemoryRuntimeContractFixture> | MemoryRuntimeContractFixture,
): void {
  describe(`${name} MemoryRuntimePort contract`, () => {
    it("覆盖 thread CRUD、消息读写、删除与分页", async () => {
      const { port, ownerA } = await createFixture();
      const first = await port.createThread({ ...ownerA, id: "thread-a" });
      await port.createThread({ ...ownerA, id: "thread-b" });
      await port.appendMessages({
        ...ownerA,
        threadId: first.id,
        messages: [{ role: "user", content: "hello", metadata: {} }],
      });

      const page = await port.listThreads({ ...ownerA, limit: 1 });
      const messages = await port.listMessages({ ...ownerA, threadId: first.id });
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
      expect(messages.items).toMatchObject([{ threadId: first.id, content: "hello" }]);

      await port.deleteThread({ ...ownerA, threadId: first.id });
      await expect(port.getThread({ ...ownerA, threadId: first.id })).resolves.toBeNull();
    });

    it("拒绝跨 resource/owner 访问同一 thread", async () => {
      const { port, ownerA, ownerB } = await createFixture();
      const thread = await port.createThread({ ...ownerA, id: "owned-thread" });

      await expect(port.getThread({ ...ownerB, threadId: thread.id })).rejects.toMatchObject({
        code: "RUNTIME_OWNERSHIP_CONFLICT",
      });
    });
  });
}
