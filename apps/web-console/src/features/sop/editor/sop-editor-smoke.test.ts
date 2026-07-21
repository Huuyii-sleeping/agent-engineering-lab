import { describe, expect, it } from "vitest";
import { getAvailableVariables, migrateSopDraftV1 } from "@orbit/workflow-core";
import { validateSop } from "../lib/sop-validate";
import { pasteSelection, serializeSelection } from "./sop-clipboard";
import { buildWorkflowDraft, toFlowEdges, toFlowNodes } from "./sop-flow-adapter";
import { pushHistory, undoHistory } from "./sop-history";
import { layoutFlowGraph } from "./sop-layout";

describe("SOP editor smoke", () => {
  it("覆盖 v1 导入、连接、变量、复制、撤销、布局和校验", async () => {
    const imported = migrateSopDraftV1({
      id: "smoke", name: "Smoke", summary: "", updatedAt: 1,
      nodes: [{ id: "start", type: "start", label: "开始", position: { x: 0, y: 0 } }, { id: "step", type: "process", label: "处理", position: { x: 0, y: 100 } }, { id: "end", type: "end", label: "结束", position: { x: 0, y: 200 } }],
      edges: [{ id: "a", source: "start", target: "step" }, { id: "b", source: "step", target: "end" }],
    });
    const nodes = toFlowNodes(imported);
    const edges = toFlowEdges(imported);
    expect(getAvailableVariables(imported, "step").length).toBeGreaterThan(0);

    const copied = serializeSelection(imported.id, nodes, edges, new Set(["start", "step"]));
    let sequence = 0;
    expect(pasteSelection(copied, (prefix) => `${prefix}-smoke-${++sequence}`).nodes).toHaveLength(2);

    const history = pushHistory({ past: [], future: [] }, { nodes, edges });
    expect(undoHistory(history, { nodes: nodes.slice(1), edges: [] })?.snapshot.nodes).toHaveLength(3);

    const laidOut = await layoutFlowGraph(nodes, edges, "LR");
    const draft = buildWorkflowDraft(imported, imported.name, imported.summary, laidOut, edges);
    expect(validateSop(draft).ok).toBe(true);
  });
});
