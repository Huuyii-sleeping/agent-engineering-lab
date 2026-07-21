import { describe, expect, it } from "vitest";
import {
  WORKFLOW_SCHEMA_VERSION,
  builtinNodeRegistry,
  compileWorkflow,
  type WorkflowDraft,
  type WorkflowVersion,
} from "../../../src/index.js";

function node<T extends "start" | "template" | "end">(type: T, id: string) {
  const definition = builtinNodeRegistry.get(type)!;
  const config = definition.createDefaultConfig();
  return {
    kind: "builtin" as const,
    id,
    type,
    version: definition.version,
    label: definition.label,
    position: { x: 0, y: 0 },
    config,
    ports: definition.createPorts(config),
  };
}

function validDraft(): WorkflowDraft {
  const start = node("start", "start");
  const transform = node("template", "transform");
  const end = node("end", "end");
  transform.config.template = "完成";
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "workflow-compile",
    name: "编译测试",
    summary: "稳定 IR",
    revision: 2,
    createdAt: 1,
    updatedAt: 2,
    nodes: [end, transform, start],
    edges: [
      { id: "edge-2", source: { nodeId: "transform", portId: "text" }, target: { nodeId: "end", portId: "in" }, status: "valid" },
      { id: "edge-1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "transform", portId: "in" }, status: "valid" },
    ],
  };
}

describe("compileWorkflow", () => {
  it("将合法草稿编译为稳定拓扑、资源预算和 executor binding", () => {
    const result = compileWorkflow(validDraft());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.source).toMatchObject({ kind: "draft", workflowId: "workflow-compile", revision: 2 });
    expect(result.ir.topology.orderedNodeIds).toEqual(["start", "transform", "end"]);
    expect(result.ir.topology.dependencies).toEqual({ start: [], transform: ["start"], end: ["transform"] });
    expect(result.ir.nodes.map((item) => item.executor)).toEqual([
      { id: "workflow.start", version: 1 },
      { id: "workflow.template", version: 1 },
      { id: "workflow.end", version: 1 },
    ]);
    expect(result.ir.nodes[1].execution).toMatchObject({ idempotent: true, maxAttempts: 2, onError: "fail" });
    expect(result.ir.resourceBudget.estimate).toMatchObject({ nodeCount: 3, edgeCount: 2, maxParallelism: 1 });
  });

  it("保留不可变发布版本的来源 id、版本号和内容 hash", () => {
    const draft = validDraft();
    const version: WorkflowVersion = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "version-1",
      workflowId: draft.id,
      version: 4,
      contentHash: "content-hash",
      createdAt: 10,
      createdBy: "tester",
      nodes: draft.nodes,
      edges: draft.edges,
      metadata: { name: draft.name, summary: draft.summary },
    };

    const result = compileWorkflow(version);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ir.source).toEqual({
      kind: "version",
      workflowId: draft.id,
      versionId: "version-1",
      version: 4,
      contentHash: "content-hash",
    });
  });

  it("迁移 v1 草稿后再进入编译流水线", () => {
    const result = compileWorkflow({
      id: "legacy",
      name: "旧流程",
      summary: "v1",
      updatedAt: 1,
      nodes: [
        { id: "start", type: "start", label: "开始", position: { x: 0, y: 0 } },
        { id: "end", type: "end", label: "结束", position: { x: 0, y: 100 } },
      ],
      edges: [{ id: "edge", source: "start", target: "end" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ir.source).toMatchObject({ kind: "draft", workflowId: "legacy", migrated: true });
  });

  it("同时报告 schema、节点版本、executor 和资源限制错误", () => {
    const draft = validDraft();
    const transform = draft.nodes.find((item) => item.id === "transform")!;
    if (transform.kind !== "builtin" || transform.type !== "template") throw new Error("fixture error");
    transform.version = 99;
    transform.config = { template: "完成", variables: {} };
    const result = compileWorkflow(draft, {
      limits: { maxNodes: 2 },
      executors: [{ id: "workflow.start", version: 1 }, { id: "workflow.end", version: 1 }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "compile.node-limit",
      "compile.node-version",
      "compile.executor-missing",
    ]));
  });

  it("拒绝不可达的下游变量引用", () => {
    const draft = validDraft();
    const transform = draft.nodes.find((item) => item.id === "transform")!;
    if (transform.kind !== "builtin" || transform.type !== "template") throw new Error("fixture error");
    transform.config.variables = {
      invalid: { kind: "variable", ref: { scope: "node-output", nodeId: "end", portId: "result" } },
    };

    const result = compileWorkflow(draft);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "variable.unavailable", location: { kind: "node", nodeId: "transform" } }),
    ]));
  });
});
