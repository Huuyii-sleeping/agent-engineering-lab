import { describe, expect, it } from "vitest";
import { checkPortConnection, getAvailableVariables, migrateSopDraftV1 } from "@orbit/workflow-core";
import { validateSop } from "../lib/sop-validate";
import { reconcileFlowEdges } from "./sop-connections";
import { toFlowEdges, toFlowNodes } from "./sop-flow-adapter";
import { createLargeWorkflowFixture } from "./sop-performance-fixture";
import { layoutFlowGraph } from "./sop-layout";

describe("production workflow editor", () => {
  it("标记节点配置变化后失效的边而不删除", () => {
    const draft = migrateSopDraftV1({ id: "d", name: "d", summary: "", updatedAt: 1, nodes: [{ id: "s", type: "start", label: "S", position: { x: 0, y: 0 } }, { id: "e", type: "end", label: "E", position: { x: 0, y: 1 } }], edges: [{ id: "se", source: "s", target: "e" }] });
    const nodes = toFlowNodes(draft);
    nodes[1].data.node = { ...nodes[1].data.node, ports: { inputs: [], outputs: [] } };
    const reconciled = reconcileFlowEdges(nodes, toFlowEdges(draft));
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].data).toMatchObject({ status: "needs-repair" });
  });

  it("下游节点看不到不可达节点变量", () => {
    const draft = migrateSopDraftV1({ id: "d", name: "d", summary: "", updatedAt: 1, nodes: [{ id: "s", type: "start", label: "S", position: { x: 0, y: 0 } }, { id: "a", type: "process", label: "A", position: { x: 0, y: 1 } }, { id: "b", type: "process", label: "B", position: { x: 0, y: 2 } }], edges: [{ id: "sa", source: "s", target: "a" }] });
    expect(getAvailableVariables(draft, "a").some((item) => item.label.startsWith("B."))).toBe(false);
  });

  it("自动布局保持固定节点位置", async () => {
    const draft = createLargeWorkflowFixture();
    const nodes = toFlowNodes(draft).slice(0, 5);
    nodes[0] = { ...nodes[0], draggable: false, position: { x: 777, y: 888 } };
    const laidOut = await layoutFlowGraph(nodes, toFlowEdges(draft).filter((edge) => Number(edge.target.split("-")[1]) < 5), "LR");
    expect(laidOut[0].position).toEqual({ x: 777, y: 888 });
  });

  it("200 节点 / 400 边在性能门槛内完成映射和校验", () => {
    const draft = createLargeWorkflowFixture();
    const startedAt = performance.now();
    expect(toFlowNodes(draft)).toHaveLength(200);
    expect(toFlowEdges(draft)).toHaveLength(400);
    expect(validateSop(draft).ok).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });

  it("拒绝方向或端口不存在的连接", () => {
    const draft = createLargeWorkflowFixture();
    expect(checkPortConnection(draft.nodes, { nodeId: "node-0", portId: "missing" }, { nodeId: "node-1", portId: "in" })).toMatchObject({ valid: false });
  });
});
