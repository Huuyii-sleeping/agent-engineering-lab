import { describe, expect, it } from "vitest";
import { migrateSopDraftV1, type LegacySopDraftV1 } from "../../../src/migration/v1.js";

const legacy: LegacySopDraftV1 = {
  id: "review",
  name: "评审流程",
  summary: "保留结构",
  updatedAt: 1_700_000_000_000,
  nodes: [
    { id: "start", type: "start", label: "开始", position: { x: 10, y: 20 } },
    { id: "judge", type: "condition", label: "判断", position: { x: 30, y: 40 }, condition: "score > 60" },
    { id: "end", type: "end", label: "结束", position: { x: 50, y: 60 } },
  ],
  edges: [
    { id: "e1", source: "start", target: "judge" },
    { id: "e2", source: "judge", target: "end", sourceHandle: "true", label: "是" },
  ],
};

describe("migrateSopDraftV1", () => {
  it("无损保留节点、位置、连线与可识别配置", () => {
    const migrated = migrateSopDraftV1(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.nodes.map(({ id, position }) => ({ id, position }))).toEqual(legacy.nodes.map(({ id, position }) => ({ id, position })));
    expect(migrated.edges[1]).toMatchObject({ source: { nodeId: "judge", portId: "true" }, target: { nodeId: "end", portId: "in" }, label: "是" });
    expect(migrated.nodes.find((node) => node.id === "judge")).toMatchObject({ type: "condition", config: { expression: "score > 60" } });
  });

  it("重复迁移保持幂等", () => {
    const once = migrateSopDraftV1(legacy);
    expect(migrateSopDraftV1(once)).toEqual(once);
  });

  it("引用不存在节点时不覆盖原数据并明确失败", () => {
    expect(() => migrateSopDraftV1({ ...legacy, edges: [{ id: "broken", source: "missing", target: "end" }] })).toThrow("不存在的节点");
  });
});
