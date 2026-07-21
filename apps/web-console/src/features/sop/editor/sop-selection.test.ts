import { describe, expect, it } from "vitest";
import { toFlowEdges, toFlowNodes } from "./sop-flow-adapter";
import { cloneSelectedGraph } from "./sop-selection";
import { migrateSopDraftV1 } from "@orbit/workflow-core";

describe("cloneSelectedGraph", () => {
  it("复制子图并重写内部连边 ID", () => {
    const draft = migrateSopDraftV1({
      id: "copy", name: "copy", summary: "", updatedAt: 1,
      nodes: [{ id: "a", type: "start", label: "A", position: { x: 0, y: 0 } }, { id: "b", type: "end", label: "B", position: { x: 0, y: 100 } }],
      edges: [{ id: "ab", source: "a", target: "b" }],
    });
    let sequence = 0;
    const cloned = cloneSelectedGraph(toFlowNodes(draft), toFlowEdges(draft), new Set(["a", "b"]), (prefix) => `${prefix}-${++sequence}`);
    expect(cloned.nodes.map((node) => node.id)).toEqual(["n-1", "n-2"]);
    expect(cloned.edges[0]).toMatchObject({ id: "e-3", source: "n-1", target: "n-2" });
  });
});
