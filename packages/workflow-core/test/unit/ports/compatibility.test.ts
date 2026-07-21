import { describe, expect, it } from "vitest";
import { checkPortConnection } from "../../../src/ports/compatibility.js";
import { migrateSopDraftV1 } from "../../../src/migration/v1.js";
import type { WorkflowNode } from "../../../src/contracts/nodes.js";

describe("checkPortConnection", () => {
  it("报告不存在端口和自连接", () => {
    const draft = migrateSopDraftV1({ id: "d", name: "d", summary: "", updatedAt: 1, nodes: [{ id: "s", type: "start", label: "S", position: { x: 0, y: 0 } }, { id: "e", type: "end", label: "E", position: { x: 0, y: 1 } }], edges: [] });
    expect(checkPortConnection(draft.nodes, { nodeId: "s", portId: "out" }, { nodeId: "e", portId: "in" })).toEqual({ valid: true });
    expect(checkPortConnection(draft.nodes, { nodeId: "s", portId: "missing" }, { nodeId: "e", portId: "in" })).toMatchObject({ valid: false });
    expect(checkPortConnection(draft.nodes, { nodeId: "s", portId: "out" }, { nodeId: "s", portId: "in" })).toMatchObject({ valid: false });
  });

  it("拒绝 object 输出连接 string 输入", () => {
    const source = { kind: "unknown", id: "source", type: "source", version: 1, label: "source", position: { x: 0, y: 0 }, original: {}, ports: { inputs: [], outputs: [{ id: "out", name: "out", direction: "output", dataType: "object" }] } } satisfies WorkflowNode;
    const target = { kind: "unknown", id: "target", type: "target", version: 1, label: "target", position: { x: 1, y: 0 }, original: {}, ports: { inputs: [{ id: "in", name: "in", direction: "input", dataType: "string" }], outputs: [] } } satisfies WorkflowNode;
    expect(checkPortConnection([source, target], { nodeId: "source", portId: "out" }, { nodeId: "target", portId: "in" })).toEqual({ valid: false, reason: "类型不兼容：object 不能连接到 string。" });
  });
});
