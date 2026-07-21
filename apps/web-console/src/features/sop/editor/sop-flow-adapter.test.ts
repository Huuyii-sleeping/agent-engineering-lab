import { describe, expect, it } from "vitest";
import { migrateSopDraftV1 } from "@orbit/workflow-core";
import { buildWorkflowDraft, parseWorkflowDraftJson, toFlowEdges, toFlowNodes } from "./sop-flow-adapter";

const draft = migrateSopDraftV1({
  id: "draft",
  name: "Adapter",
  summary: "test",
  updatedAt: 1,
  nodes: [
    { id: "start", type: "start", label: "开始", position: { x: 1, y: 2 } },
    { id: "end", type: "end", label: "结束", position: { x: 3, y: 4 } },
  ],
  edges: [{ id: "edge", source: "start", target: "end" }],
});

describe("sop-flow-adapter", () => {
  it("在 React Flow 与 workflow v2 间保留端口和位置", () => {
    const nodes = toFlowNodes(draft);
    nodes[1].position = { x: 30, y: 40 };
    const restored = buildWorkflowDraft(draft, " Updated ", " summary ", nodes, toFlowEdges(draft));
    expect(restored.name).toBe("Updated");
    expect(restored.nodes[1].position).toEqual({ x: 30, y: 40 });
    expect(restored.edges[0]).toMatchObject({ source: { nodeId: "start", portId: "out" }, target: { nodeId: "end", portId: "in" } });
  });

  it("拒绝 React Flow 内部 JSON", () => {
    expect(() => parseWorkflowDraftJson('{"nodes":[],"edges":[]}')).toThrow("schemaVersion: 2");
    expect(parseWorkflowDraftJson(JSON.stringify(draft))).toEqual(draft);
  });
});
