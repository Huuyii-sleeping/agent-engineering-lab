import { describe, expect, it } from "vitest";
import { findAncestorNodeIds, findCycle, findReachableNodeIds, topologicalSort } from "../../../src/graph/graph.js";
import type { WorkflowEdge } from "../../../src/contracts/workflow.js";

const nodes = [{ id: "start" }, { id: "a" }, { id: "b" }, { id: "end" }];
const edge = (id: string, source: string, target: string): WorkflowEdge => ({ id, source: { nodeId: source, portId: "out" }, target: { nodeId: target, portId: "in" } });
const edges = [edge("e1", "start", "a"), edge("e2", "a", "b"), edge("e3", "b", "end")];

describe("workflow graph", () => {
  it("计算可达性和上游作用域", () => {
    expect([...findReachableNodeIds(nodes, edges, ["start"])]).toEqual(["start", "a", "b", "end"]);
    expect([...findAncestorNodeIds(nodes, edges, "end")]).toEqual(["end", "b", "a", "start"].filter((id) => id !== "end"));
  });

  it("稳定排序 DAG", () => {
    expect(topologicalSort(nodes, edges)).toEqual(["start", "a", "b", "end"]);
  });

  it("报告环路径并阻止排序", () => {
    const cyclic = [...edges, edge("e4", "end", "a")];
    expect(findCycle(nodes, cyclic)).toEqual(["a", "b", "end", "a"]);
    expect(() => topologicalSort(nodes, cyclic)).toThrow("不是 DAG");
  });
});
