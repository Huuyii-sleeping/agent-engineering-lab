import { describe, expect, it } from "vitest";
import { pasteSelection, serializeSelection } from "./sop-clipboard";
import { migrateSopDraftV1 } from "@orbit/workflow-core";
import { toFlowEdges, toFlowNodes } from "./sop-flow-adapter";

describe("workflow clipboard", () => {
  it("跨工作流粘贴时重写节点和连边 ID", () => {
    const draft = migrateSopDraftV1({ id: "d", name: "d", summary: "", updatedAt: 1, nodes: [{ id: "a", type: "start", label: "A", position: { x: 0, y: 0 } }, { id: "b", type: "end", label: "B", position: { x: 0, y: 1 } }], edges: [{ id: "ab", source: "a", target: "b" }] });
    const text = serializeSelection(draft.id, toFlowNodes(draft), toFlowEdges(draft), new Set(["a", "b"]));
    let index = 0;
    const pasted = pasteSelection(text, (prefix) => `${prefix}-${++index}`);
    expect(pasted.edges[0]).toMatchObject({ source: "n-1", target: "n-2", id: "e-3" });
  });
});
