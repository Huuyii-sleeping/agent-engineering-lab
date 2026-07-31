import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type BuiltinNodeType,
  WORKFLOW_SCHEMA_VERSION,
  builtinNodeRegistry,
  compileWorkflow,
  isWorkflowIR,
  stableSerialize,
  type WorkflowDraft,
  type WorkflowVersion,
} from "../../../src/index.js";

function node<T extends BuiltinNodeType>(type: T, id: string) {
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

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.ir.source).toMatchObject({ kind: "draft", workflowId: "workflow-compile", revision: 2 });
    expect(result.ir.irVersion).toBe(2);
    expect(result.ir.nodes.map((item) => item.kind)).toEqual(["executable", "executable", "executable"]);
    expect(result.ir.topology.orderedNodeIds).toEqual(["start", "transform", "end"]);
    expect(result.ir.topology.dependencies).toEqual({ start: [], transform: ["start"], end: ["transform"] });
    expect(result.ir.nodes.map((item) => item.executor)).toEqual([
      { id: "workflow.start", version: 1 },
      { id: "workflow.template", version: 1 },
      { id: "workflow.end", version: 1 },
    ]);
    expect(result.ir.nodes[1].execution).toMatchObject({ idempotent: true, maxAttempts: 2, onError: "fail" });
    expect(result.ir.resourceBudget.estimate).toMatchObject({ nodeCount: 3, edgeCount: 2, maxParallelism: 1 });
    const golden = readFileSync(new URL("../../fixtures/ir-v2/p0-linear.json", import.meta.url), "utf8").trim();
    expect(stableSerialize(result.ir)).toBe(golden);
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

  it("递归计入容器节点、动态步骤、并发度和嵌套深度", () => {
    const start = node("start", "start");
    const iteration = node("iteration", "iteration");
    const body = node("template", "body");
    body.config.template = "{{item}}";
    iteration.config.maxItems = 3;
    iteration.config.maxConcurrency = 2;
    iteration.config.body.nodes = [body];
    const end = node("end", "end");
    const source: WorkflowDraft = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "recursive-budget",
      name: "Recursive budget",
      summary: "",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [start, iteration, end],
      edges: [
        { id: "start-iteration", source: { nodeId: "start", portId: "out" }, target: { nodeId: "iteration", portId: "items" } },
        { id: "iteration-end", source: { nodeId: "iteration", portId: "results" }, target: { nodeId: "end", portId: "in" } },
      ],
    };

    const compiled = compileWorkflow(source);
    expect(compiled.ok).toBe(true);
    if (compiled.ok) expect(compiled.ir.resourceBudget.estimate).toEqual({
      nodeCount: 4,
      edgeCount: 2,
      estimatedSteps: 6,
      maxParallelism: 2,
      maxNestedDepth: 1,
    });

    expect(compileWorkflow(source, { limits: { maxEstimatedSteps: 5 } }).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "compile.step-limit" }),
    ]));
    expect(compileWorkflow(source, { limits: { maxNodes: 3 } }).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "compile.node-limit", message: expect.stringContaining("递归节点数 4") }),
    ]));
  });

  it("将 Parallel 到 Merge 编译为声明顺序稳定的 branch IR", () => {
    const start = node("start", "start");
    const parallel = node("parallel", "parallel");
    parallel.config.branches = [{ id: "left", label: "Left" }, { id: "right", label: "Right" }];
    parallel.config.maxConcurrency = 2;
    parallel.ports = builtinNodeRegistry.get("parallel")!.createPorts(parallel.config);
    const left = node("template", "left-node");
    left.config.template = "left";
    const right = node("template", "right-node");
    right.config.template = "right";
    const merge = node("merge", "merge");
    merge.config.parallelNodeId = parallel.id;
    const end = node("end", "end");
    const source: WorkflowDraft = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "parallel-ir",
      name: "Parallel IR",
      summary: "",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [start, parallel, left, right, merge, end],
      edges: [
        { id: "start-parallel", source: { nodeId: "start", portId: "out" }, target: { nodeId: "parallel", portId: "in" } },
        { id: "parallel-left", source: { nodeId: "parallel", portId: "left" }, target: { nodeId: "left-node", portId: "in" } },
        { id: "parallel-right", source: { nodeId: "parallel", portId: "right" }, target: { nodeId: "right-node", portId: "in" } },
        { id: "left-merge", source: { nodeId: "left-node", portId: "text" }, target: { nodeId: "merge", portId: "branches" } },
        { id: "right-merge", source: { nodeId: "right-node", portId: "text" }, target: { nodeId: "merge", portId: "branches" } },
        { id: "merge-end", source: { nodeId: "merge", portId: "result" }, target: { nodeId: "end", portId: "in" } },
      ],
    };

    const result = compileWorkflow(source);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const compiled = result.ir.nodes.find((item) => item.id === "parallel");
    expect(compiled).toMatchObject({
      kind: "parallel",
      merge: { nodeId: "merge", strategy: "ordered", allowMissing: false },
      branches: [
        { id: "left", order: 0, entryNodeId: "left-node", graph: { topology: { orderedNodeIds: ["left-node"] } } },
        { id: "right", order: 1, entryNodeId: "right-node", graph: { topology: { orderedNodeIds: ["right-node"] } } },
      ],
    });
  });

  it("递归编译 Iteration/Loop body 并保留输入输出绑定", () => {
    const start = node("start", "start");
    const iteration = node("iteration", "iteration");
    iteration.config.maxItems = 2;
    const iterationBody = node("template", "iteration-body-node");
    iterationBody.config.template = "item";
    iteration.config.body.nodes = [iterationBody];
    iteration.config.inputBindings = [{ inputId: "context", value: { kind: "literal", value: "orbit" } }];
    const loop = node("loop", "loop");
    loop.config.maxIterations = 2;
    const loopBody = node("template", "loop-body-node");
    loopBody.config.template = "loop";
    loop.config.body.nodes = [loopBody];
    loop.config.initialVariables = [{ id: "count", name: "Count", dataType: "integer", value: { kind: "literal", value: 0 } }];
    const end = node("end", "end");
    const source: WorkflowDraft = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "container-ir",
      name: "Container IR",
      summary: "",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [start, iteration, loop, end],
      edges: [
        { id: "start-iteration", source: { nodeId: "start", portId: "out" }, target: { nodeId: "iteration", portId: "items" } },
        { id: "iteration-loop", source: { nodeId: "iteration", portId: "results" }, target: { nodeId: "loop", portId: "in" } },
        { id: "loop-end", source: { nodeId: "loop", portId: "result" }, target: { nodeId: "end", portId: "in" } },
      ],
    };

    const result = compileWorkflow(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.nodes.find((item) => item.id === "iteration")).toMatchObject({
      kind: "iteration",
      config: { inputBindings: [{ inputId: "context" }] },
      body: { topology: { orderedNodeIds: ["iteration-body-node"] } },
    });
    expect(result.ir.nodes.find((item) => item.id === "loop")).toMatchObject({
      kind: "loop",
      config: { initialVariables: [{ id: "count" }] },
      body: { topology: { orderedNodeIds: ["loop-body-node"] } },
    });
  });

  it("将固定 Subworkflow、Agent child-run 和审批 suspend identity 写入 IR dependencies", () => {
    const start = node("start", "start");
    const subworkflow = node("subworkflow", "subworkflow");
    subworkflow.config.workflowId = "child-workflow";
    subworkflow.config.versionId = "child-v1";
    subworkflow.config.contentHash = "child-hash";
    const agent = node("agent", "agent");
    agent.config.agentProfileId = "profile-1";
    agent.config.agentVersionId = "agent-v1";
    const approval = node("human-approval", "approval");
    approval.config.policyId = "policy-1";
    approval.config.displayFields = [{
      id: "summary",
      label: "摘要",
      value: { kind: "literal", value: "发布生产版本" },
    }];
    const end = node("end", "end");
    const childStart = node("start", "child-start");
    const childEnd = node("end", "child-end");
    const childVersion: WorkflowVersion = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "child-v1",
      workflowId: "child-workflow",
      version: 3,
      contentHash: "child-hash",
      createdAt: 1,
      createdBy: "test",
      nodes: [childStart, childEnd],
      edges: [{ id: "child-edge", source: { nodeId: "child-start", portId: "out" }, target: { nodeId: "child-end", portId: "in" } }],
    };
    const source: WorkflowDraft = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "product-ref-ir",
      name: "Product refs",
      summary: "",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [start, subworkflow, agent, approval, end],
      edges: [
        { id: "start-sub", source: { nodeId: "start", portId: "out" }, target: { nodeId: "subworkflow", portId: "in" } },
        { id: "sub-agent", source: { nodeId: "subworkflow", portId: "result" }, target: { nodeId: "agent", portId: "in" } },
        { id: "agent-approval", source: { nodeId: "agent", portId: "result" }, target: { nodeId: "approval", portId: "in" } },
        { id: "approval-end", source: { nodeId: "approval", portId: "approved" }, target: { nodeId: "end", portId: "in" } },
      ],
    };
    const options = {
      workflowVersions: { resolvePublishedVersion: () => childVersion },
      agentVersions: {
        resolvePublishedVersion: () => ({
          id: "agent-v1",
          agentProfileId: "profile-1",
          version: 1,
          contentHash: "agent-hash-1",
          name: "发布 Agent",
          description: "",
          instructions: ["执行工作流节点。"],
          toolPolicy: { allowedToolIds: [] },
          skillPolicy: { bindings: [] },
          outputSchema: agent.config.outputSchema,
          createdBy: "test",
          releaseNotes: "",
          createdAt: 1,
        }),
      },
      approvalPolicies: { hasPolicy: () => true },
    };

    const first = compileWorkflow(source, options);
    const second = compileWorkflow(structuredClone(source), options);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.ir.nodes.find((item) => item.id === "subworkflow")).toMatchObject({
      kind: "subworkflow",
      dependency: { workflowId: "child-workflow", versionId: "child-v1", version: 3, contentHash: "child-hash" },
      workflow: { topology: { orderedNodeIds: ["child-start", "child-end"] } },
    });
    expect(first.ir.nodes.find((item) => item.id === "agent")).toMatchObject({
      kind: "agent",
      childRun: {
        agentProfileId: "profile-1",
        agentVersionId: "agent-v1",
        contentHash: "agent-hash-1",
        memoryIsolation: "node-run",
      },
    });
    expect(first.ir.nodes.find((item) => item.id === "approval")).toMatchObject({
      kind: "human-approval",
      suspend: {
        policyId: "policy-1",
        displayFields: [{ id: "summary", label: "摘要", value: { kind: "literal", value: "发布生产版本" } }],
      },
    });
    expect(first.ir.dependencies).toEqual(expect.arrayContaining([
      { kind: "workflow-version", workflowId: "child-workflow", versionId: "child-v1", version: 3, contentHash: "child-hash" },
      { kind: "agent-version", agentProfileId: "profile-1", agentVersionId: "agent-v1", contentHash: "agent-hash-1" },
      { kind: "approval-policy", policyId: "policy-1" },
    ]));
    expect(isWorkflowIR(first.ir)).toBe(true);
    expect(stableSerialize(first.ir)).toBe(stableSerialize(second.ir));
    expect(stableSerialize(first.ir)).not.toContain("resumeToken");
  });
});
