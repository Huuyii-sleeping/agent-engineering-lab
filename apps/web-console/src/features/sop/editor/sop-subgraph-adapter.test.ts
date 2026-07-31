import { describe, expect, it } from "vitest";
import { builtinNodeRegistry, type WorkflowDraft, type WorkflowNode } from "@orbit/workflow-core";
import {
  enterSopContainer,
  getSopContainerAtPath,
  getSopGraphAtPath,
  getSopScopeCrumbs,
  getSopScopeKey,
  getSopSubgraphVariablesAtPath,
  updateSopGraphAtPath,
} from "./sop-subgraph-adapter";

const makeNode = <T extends "iteration" | "loop">(type: T, id: string, label: string) => {
  const definition = builtinNodeRegistry.get(type)!;
  const config = definition.createDefaultConfig();
  return {
    kind: "builtin",
    id,
    type,
    version: definition.version,
    label,
    position: { x: 0, y: 0 },
    config: { ...config, body: { ...config.body, id: `${id}-body` } },
    ports: definition.createPorts(config),
  } as WorkflowNode;
};

const unknownNode: WorkflowNode = {
  kind: "unknown",
  id: "unknown",
  type: "vendor.custom",
  version: 7,
  label: "未知节点",
  position: { x: 8, y: 9 },
  ports: { inputs: [], outputs: [] },
  original: { nested: { untouched: true } },
};

function fixture(): WorkflowDraft {
  const iteration = makeNode("iteration", "iteration", "逐条处理");
  const loop = makeNode("loop", "loop", "等待完成");
  if (iteration.kind !== "builtin" || iteration.type !== "iteration" || loop.kind !== "builtin" || loop.type !== "loop") throw new Error("fixture 类型错误");
  iteration.config.body.nodes = [loop, unknownNode];
  return {
    schemaVersion: 2,
    id: "draft",
    name: "阶段 E",
    summary: "",
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    nodes: [iteration],
    edges: [],
  };
}

describe("sop-subgraph-adapter", () => {
  it("按稳定容器路径读取嵌套子图并生成面包屑", () => {
    const draft = fixture();
    expect(enterSopContainer(draft, [], "iteration")).toEqual(["iteration"]);
    expect(getSopGraphAtPath(draft, ["iteration"]).nodes.map((node) => node.id)).toEqual(["loop", "unknown"]);
    expect(getSopGraphAtPath(draft, ["iteration", "loop"])).toMatchObject({ nodes: [], edges: [] });
    expect(getSopContainerAtPath(draft, ["iteration", "loop"])).toMatchObject({ id: "loop", type: "loop" });
    expect(getSopContainerAtPath(draft, [])).toBeNull();
    expect(getSopSubgraphVariablesAtPath(draft, ["iteration"], "loop").map((variable) => variable.id)).toEqual(expect.arrayContaining([
      "loop:iteration:item",
      "loop:iteration:index",
    ]));
    expect(getSopScopeCrumbs(draft, ["iteration", "loop"])).toEqual([
      { nodeId: null, label: "阶段 E", subgraphId: null, path: [] },
      { nodeId: "iteration", label: "逐条处理", subgraphId: "iteration-body", path: ["iteration"] },
      { nodeId: "loop", label: "等待完成", subgraphId: "loop-body", path: ["iteration", "loop"] },
    ]);
    expect(getSopScopeKey(["iteration", "loop"])).toBe("root/iteration/loop");
  });

  it("只替换目标图并保留 subgraph id、未知节点与父图原文", () => {
    const draft = fixture();
    const originalRoot = draft.nodes[0];
    const replacement = { nodes: [{ ...unknownNode, position: { x: 80, y: 90 } }], edges: [] };
    const updated = updateSopGraphAtPath(draft, ["iteration"], replacement);
    const rootContainer = updated.nodes[0];
    expect(rootContainer).not.toBe(draft.nodes[0]);
    if (rootContainer.kind !== "builtin" || rootContainer.type !== "iteration") throw new Error("fixture 类型错误");
    expect(rootContainer.config.body.id).toBe("iteration-body");
    expect(rootContainer.config.body.inputs).toEqual([]);
    expect(rootContainer.config.body.outputs).toEqual([]);
    expect(rootContainer.config.body.nodes[0]).toEqual(replacement.nodes[0]);
    expect((rootContainer.config.body.nodes[0] as typeof unknownNode).original).toEqual({ nested: { untouched: true } });
    expect(draft.nodes[0]).toBe(originalRoot);
  });

  it("对损坏路径尽早给出可读错误", () => {
    expect(() => getSopGraphAtPath(fixture(), ["missing"])).toThrow("不存在节点 missing");
    expect(() => enterSopContainer(fixture(), ["iteration"], "unknown")).toThrow("不是可编辑的 Iteration/Loop 容器");
  });
});
