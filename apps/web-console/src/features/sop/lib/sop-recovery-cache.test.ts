import { describe, expect, it } from "vitest";
import { createSopDraft } from "./sop-store";
import { clearSopRecovery, readSopRecovery, writeSopRecovery } from "./sop-recovery-cache";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

describe("sop recovery cache", () => {
  it("只恢复与服务端 revision 匹配的未提交副本", () => {
    const storage = memoryStorage();
    const server = createSopDraft();
    const local = { ...server, name: "浏览器未提交修改" };
    writeSopRecovery(storage, server.revision, local);
    expect(readSopRecovery(storage, server)?.name).toBe("浏览器未提交修改");
    expect(readSopRecovery(storage, { ...server, revision: 1 })).toBeNull();
    clearSopRecovery(storage, server.id);
    expect(readSopRecovery(storage, server)).toBeNull();
  });
});
