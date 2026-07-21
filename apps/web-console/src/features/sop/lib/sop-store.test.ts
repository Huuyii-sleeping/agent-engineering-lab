import { describe, expect, it } from "vitest";
import { listSopDrafts, readLegacySopBackup, writeSopDrafts } from "./sop-store";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("sop-store migration", () => {
  it("迁移 v1 前保留只读备份并写入 v2", () => {
    const store = storage();
    const legacy = JSON.stringify([{ id: "legacy", name: "旧流程", summary: "", updatedAt: 1, nodes: [{ id: "start", type: "start", label: "开始", position: { x: 0, y: 0 } }], edges: [] }]);
    store.setItem("agent-web-console-sop-drafts-v1", legacy);
    const drafts = listSopDrafts(store);
    expect(drafts[0].schemaVersion).toBe(2);
    expect(readLegacySopBackup(store)).toBe(legacy);
    writeSopDrafts(store, drafts);
    expect(listSopDrafts(store)[0].id).toBe("legacy");
  });

  it("迁移失败时不会生成 v2 数据", () => {
    const store = storage();
    store.setItem("agent-web-console-sop-drafts-v1", JSON.stringify([{ id: "broken", name: "坏数据", nodes: [], edges: [{ id: "e", source: "missing", target: "missing" }] }]));
    expect(() => listSopDrafts(store)).toThrow();
    expect(store.getItem("agent-web-console-sop-drafts-v2")).toBeNull();
  });
});
