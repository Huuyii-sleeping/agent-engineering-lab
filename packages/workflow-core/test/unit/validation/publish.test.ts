import { describe, expect, it } from "vitest";
import type { BuiltinNodeType, WorkflowNode } from "../../../src/contracts/nodes.js";
import { WORKFLOW_SCHEMA_VERSION } from "../../../src/contracts/primitives.js";
import type { WorkflowDraft, WorkflowEdge, WorkflowVersion } from "../../../src/contracts/workflow.js";
import { builtinNodeRegistry } from "../../../src/registry/builtins.js";
import { validateWorkflowDraft } from "../../../src/validation/publish.js";

function node<T extends BuiltinNodeType>(type: T, id: string, config?: unknown): WorkflowNode {
  const definition = builtinNodeRegistry.get(type)!;
  const resolved = config ?? definition.createDefaultConfig();
  return {
    kind: "builtin",
    type,
    id,
    version: definition.version,
    label: id,
    position: { x: 0, y: 0 },
    config: resolved,
    ports: definition.createPorts(resolved as never),
  } as WorkflowNode;
}

function edge(id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string): WorkflowEdge {
  return {
    id,
    source: { nodeId: sourceNodeId, portId: sourcePortId },
    target: { nodeId: targetNodeId, portId: targetPortId },
  };
}

function draft(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowDraft {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "stage-e-validation",
    name: "Stage E validation",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes,
    edges,
  };
}

describe("validateWorkflowDraft stage E", () => {
  it("只在提供生产 capability registry 时按单项阻止阶段 E 发布", () => {
    const start = node("start", "start");
    const iteration = node("iteration", "iteration");
    const end = node("end", "end");
    const source = draft([start, iteration, end], [
      edge("start-iteration", "start", "out", "iteration", "items"),
      edge("iteration-end", "iteration", "results", "end", "in"),
    ]);

    expect(validateWorkflowDraft(source, { stageECapabilities: {} }).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "runtime.capability-disabled",
        message: expect.stringContaining("iteration"),
        location: { kind: "node", nodeId: "iteration", containerId: undefined },
      }),
    ]));
    expect(validateWorkflowDraft(source, {
      stageECapabilities: { iteration: true },
    }).diagnostics.map((item) => item.code)).not.toContain("runtime.capability-disabled");
  });

  it("递归报告容器子图环和无效端口，并携带 containerId", () => {
    const start = node("start", "start");
    const iterationConfig = builtinNodeRegistry.get("iteration")!.createDefaultConfig();
    const first = node("template", "first", { template: "first", variables: {} });
    const second = node("template", "second", { template: "second", variables: {} });
    const internalEnd = node("end", "internal-end");
    iterationConfig.body.nodes = [first, second, internalEnd];
    iterationConfig.body.edges = [
      edge("first-second", "first", "text", "second", "in"),
      edge("second-first", "second", "text", "first", "in"),
      edge("broken", "first", "missing", "second", "in"),
    ];
    const iteration = node("iteration", "iteration", iterationConfig);
    const end = node("end", "end");
    const result = validateWorkflowDraft(draft(
      [start, iteration, end],
      [edge("start-iteration", "start", "out", "iteration", "items"), edge("iteration-end", "iteration", "results", "end", "in")],
    ));

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "container.cycle", location: { kind: "node", nodeId: "iteration", containerId: "iteration" } }),
      expect.objectContaining({ code: "container.edge.invalid-port", location: { kind: "edge", edgeId: "broken", containerId: "iteration" } }),
      expect.objectContaining({ code: "container.port.required", location: { kind: "port", nodeId: "internal-end", portId: "in", containerId: "iteration" } }),
    ]));
  });

  it("允许 Iteration item/index 和内部上游变量，拒绝未声明跨容器引用", () => {
    const start = node("start", "start");
    const iterationConfig = builtinNodeRegistry.get("iteration")!.createDefaultConfig();
    const first = node("template", "first", {
      template: "{{item}}",
      variables: {
        item: { kind: "variable", ref: { scope: "loop", containerNodeId: "iteration", key: "item" } },
      },
    });
    const second = node("template", "second", {
      template: "{{value}}",
      variables: {
        value: { kind: "variable", ref: { scope: "node-output", nodeId: "first", portId: "text" } },
        forbidden: { kind: "variable", ref: { scope: "workflow-input", inputId: "secret-input" } },
      },
    });
    iterationConfig.body.nodes = [first, second];
    iterationConfig.body.edges = [edge("first-second", "first", "text", "second", "in")];
    iterationConfig.body.outputs = [{
      id: "answer",
      name: "答案",
      dataType: "string",
      value: { scope: "node-output", nodeId: "second", portId: "text" },
    }];
    const iteration = node("iteration", "iteration", iterationConfig);
    const end = node("end", "end");
    const result = validateWorkflowDraft(draft(
      [start, iteration, end],
      [edge("start-iteration", "start", "out", "iteration", "items"), edge("iteration-end", "iteration", "results", "end", "in")],
    ));

    expect(result.diagnostics.filter((item) => item.code === "container.variable.unavailable")).toEqual([
      expect.objectContaining({ location: { kind: "node", nodeId: "second", containerId: "iteration" } }),
    ]);
  });

  it("校验 Parallel 分支在对应 Merge 前互不重叠", () => {
    const start = node("start", "start");
    const parallelConfig = builtinNodeRegistry.get("parallel")!.createDefaultConfig();
    parallelConfig.branches = [{ id: "left", label: "Left" }, { id: "right", label: "Right" }];
    const parallel = node("parallel", "parallel", parallelConfig);
    const left = node("template", "left-node", { template: "left", variables: {} });
    const right = node("template", "right-node", { template: "right", variables: {} });
    const merge = node("merge", "merge", { parallelNodeId: "parallel", strategy: "ordered", allowMissing: false });
    const end = node("end", "end");
    const valid = draft([start, parallel, left, right, merge, end], [
      edge("start-parallel", "start", "out", "parallel", "in"),
      edge("parallel-left", "parallel", "left", "left-node", "in"),
      edge("parallel-right", "parallel", "right", "right-node", "in"),
      edge("left-merge", "left-node", "text", "merge", "branches"),
      edge("right-merge", "right-node", "text", "merge", "branches"),
      edge("merge-end", "merge", "result", "end", "in"),
    ]);
    expect(validateWorkflowDraft(valid).diagnostics.map((item) => item.code)).not.toEqual(expect.arrayContaining([
      "parallel.branch-overlap",
      "parallel.merge-unreachable",
      "merge.parallel-missing",
    ]));

    const shared = node("template", "shared", { template: "shared", variables: {} });
    const overlapping = draft([start, parallel, left, right, shared, merge, end], [
      edge("start-parallel", "start", "out", "parallel", "in"),
      edge("parallel-left", "parallel", "left", "left-node", "in"),
      edge("parallel-right", "parallel", "right", "right-node", "in"),
      edge("left-shared", "left-node", "text", "shared", "in"),
      edge("right-shared", "right-node", "text", "shared", "in"),
      edge("shared-merge", "shared", "text", "merge", "branches"),
      edge("merge-end", "merge", "result", "end", "in"),
    ]);
    expect(validateWorkflowDraft(overlapping).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "parallel.branch-overlap", location: { kind: "node", nodeId: "shared" } }),
    ]));
  });

  it("拒绝 Iteration 非数组字面量和 Loop 非法输出引用", () => {
    const start = node("start", "start");
    const iterationConfig = builtinNodeRegistry.get("iteration")!.createDefaultConfig();
    iterationConfig.items = { kind: "literal", value: "not-array" } as never;
    const iteration = node("iteration", "iteration", iterationConfig);
    const loopConfig = builtinNodeRegistry.get("loop")!.createDefaultConfig();
    loopConfig.body.outputs = [{
      id: "invalid",
      name: "Invalid",
      dataType: "number",
      value: { scope: "workflow-input", inputId: "outside" },
    }];
    const loop = node("loop", "loop", loopConfig);
    const end = node("end", "end");
    const result = validateWorkflowDraft(draft([start, iteration, loop, end], [
      edge("start-iteration", "start", "out", "iteration", "items"),
      edge("iteration-loop", "iteration", "results", "loop", "in"),
      edge("loop-end", "loop", "result", "end", "in"),
    ]));

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "iteration.items-array", location: { kind: "field", nodeId: "iteration", fieldPath: ["items", "value"] } }),
      expect.objectContaining({ code: "container.output-scope", location: { kind: "field", nodeId: "loop", containerId: "loop", fieldPath: ["body", "outputs", "invalid", "value"] } }),
    ]));
  });

  it("在启动前拒绝超过节点 maxItems 的 Iteration 字面量", () => {
    const start = node("start", "start");
    const iterationConfig = builtinNodeRegistry.get("iteration")!.createDefaultConfig();
    iterationConfig.maxItems = 2;
    iterationConfig.items = { kind: "literal", value: [1, 2, 3] };
    const iteration = node("iteration", "iteration", iterationConfig);
    const end = node("end", "end");

    expect(validateWorkflowDraft(draft([start, iteration, end], [
      edge("start-iteration", "start", "out", "iteration", "items"),
      edge("iteration-end", "iteration", "results", "end", "in"),
    ])).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "iteration.items-limit", location: { kind: "field", nodeId: "iteration", fieldPath: ["items", "value"] } }),
    ]));
  });

  it("解析固定 Subworkflow 版本并拒绝 hash 不匹配与间接递归", () => {
    const start = node("start", "start");
    const subworkflow = node("subworkflow", "child", {
      workflowId: "child-workflow",
      versionId: "child-v1",
      contentHash: "expected-hash",
      inputBindings: [],
      outputBindings: [],
    });
    const end = node("end", "end");
    const root = draft([start, subworkflow, end], [
      edge("start-child", "start", "out", "child", "in"),
      edge("child-end", "child", "result", "end", "in"),
    ]);
    const childVersion: WorkflowVersion = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "child-v1",
      workflowId: "child-workflow",
      version: 1,
      contentHash: "actual-hash",
      createdAt: 1,
      createdBy: "test",
      nodes: [node("subworkflow", "back-to-root", {
        workflowId: root.id,
        versionId: "root-v1",
        contentHash: "root-hash",
        inputBindings: [],
        outputBindings: [],
      })],
      edges: [],
    };
    const rootVersion: WorkflowVersion = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "root-v1",
      workflowId: root.id,
      version: 1,
      contentHash: "root-hash",
      createdAt: 1,
      createdBy: "test",
      nodes: [],
      edges: [],
    };
    const versions = new Map([["child-workflow:child-v1", childVersion], [`${root.id}:root-v1`, rootVersion]]);

    expect(validateWorkflowDraft(root, {
      workflowVersions: { resolvePublishedVersion: (workflowId, versionId) => versions.get(`${workflowId}:${versionId}`) },
    }).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "subworkflow.hash-mismatch" }),
      expect.objectContaining({ code: "subworkflow.recursive", message: expect.stringContaining(`${root.id} → child-workflow → ${root.id}`) }),
    ]));
  });

  it("发布时验证 Agent version、审批策略和 Loop/Waiting 预算", () => {
    const start = node("start", "start");
    const agent = node("agent", "agent", {
      agentProfileId: "profile-1",
      agentVersionId: "agent-v1",
      inputBindings: {},
      outputSchema: { type: "object" },
      memory: { isolation: "node-run", shareThread: false },
    });
    const approval = node("human-approval", "approval", {
      policyId: "policy-1",
      displayFields: [],
      decisionSchema: { type: "object" },
      deadlineMs: 10_000,
      timeoutPolicy: "fail",
    });
    const loopConfig = builtinNodeRegistry.get("loop")!.createDefaultConfig();
    loopConfig.timeoutMs = 20_000;
    const loop = node("loop", "loop", loopConfig);
    const end = node("end", "end");
    const source = draft([start, agent, approval, loop, end], [
      edge("start-agent", "start", "out", "agent", "in"),
      edge("agent-approval", "agent", "result", "approval", "in"),
      edge("approval-loop", "approval", "approved", "loop", "in"),
      edge("loop-end", "loop", "result", "end", "in"),
    ]);

    const unavailable = validateWorkflowDraft(source, {
      agentVersions: { resolvePublishedVersion: () => undefined },
      approvalPolicies: { hasPolicy: () => false },
      maxRuntimeMs: 15_000,
      maxWaitingMs: 5_000,
    });
    expect(unavailable.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "agent.version-missing" }),
      expect.objectContaining({ code: "approval.policy-missing" }),
      expect.objectContaining({ code: "loop.runtime-budget" }),
      expect.objectContaining({ code: "approval.waiting-budget" }),
    ]));

    const available = validateWorkflowDraft(source, {
      agentVersions: {
        resolvePublishedVersion: (profileId, versionId) => profileId === "profile-1" && versionId === "agent-v1"
          ? {
              id: "agent-v1",
              agentProfileId: "profile-1",
              version: 1,
              contentHash: "agent-hash-1",
              name: "发布 Agent",
              description: "用于 Workflow 的不可变版本",
              instructions: ["按要求输出结构化结果。"],
              toolPolicy: { allowedToolIds: [] },
              skillPolicy: { bindings: [] },
              outputSchema: { type: "object" },
              createdBy: "tester",
              releaseNotes: "",
              createdAt: 1,
            }
          : undefined,
      },
      approvalPolicies: { hasPolicy: (policyId) => policyId === "policy-1" },
      maxRuntimeMs: 30_000,
      maxWaitingMs: 20_000,
    });
    expect(available.diagnostics.map((item) => item.code)).not.toEqual(expect.arrayContaining([
      "agent.version-missing",
      "approval.policy-missing",
      "loop.runtime-budget",
      "approval.waiting-budget",
    ]));

    const schemaMismatch = validateWorkflowDraft(source, {
      agentVersions: {
        resolvePublishedVersion: () => ({
          id: "agent-v1",
          agentProfileId: "profile-1",
          version: 1,
          contentHash: "agent-hash-1",
          name: "发布 Agent",
          description: "用于 Workflow 的不可变版本",
          instructions: ["按要求输出文本。"],
          toolPolicy: { allowedToolIds: [] },
          skillPolicy: { bindings: [] },
          outputSchema: { type: "string" },
          createdBy: "tester",
          releaseNotes: "",
          createdAt: 1,
        }),
      },
      approvalPolicies: { hasPolicy: () => true },
      maxRuntimeMs: 30_000,
      maxWaitingMs: 20_000,
    });
    expect(schemaMismatch.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "agent.output-schema-mismatch",
        location: expect.objectContaining({ fieldPath: ["outputSchema"] }),
      }),
    ]));

    const identityMismatch = validateWorkflowDraft(source, {
      agentVersions: {
        resolvePublishedVersion: () => ({
          id: "other-version",
          agentProfileId: "other-profile",
          version: 1,
          contentHash: "agent-hash-1",
          name: "错误 Agent",
          description: "",
          instructions: [],
          toolPolicy: { allowedToolIds: [] },
          skillPolicy: { bindings: [] },
          outputSchema: { type: "object" },
          createdBy: "tester",
          releaseNotes: "",
          createdAt: 1,
        }),
      },
      approvalPolicies: { hasPolicy: () => true },
      maxRuntimeMs: 30_000,
      maxWaitingMs: 20_000,
    });
    expect(identityMismatch.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "agent.version-identity-mismatch" }),
    ]));
  });

  it("拒绝超过五层的固定 Subworkflow 依赖链", () => {
    const start = node("start", "start");
    const subworkflow = node("subworkflow", "child", {
      workflowId: "workflow-1",
      versionId: "version-1",
      contentHash: "hash-1",
      inputBindings: [],
      outputBindings: [],
    });
    const end = node("end", "end");
    const source = draft([start, subworkflow, end], [
      edge("start-child", "start", "out", "child", "in"),
      edge("child-end", "child", "result", "end", "in"),
    ]);
    const versions = new Map<string, WorkflowVersion>();
    for (let index = 1; index <= 6; index += 1) {
      const next = index + 1;
      versions.set(`workflow-${index}:version-${index}`, {
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        id: `version-${index}`,
        workflowId: `workflow-${index}`,
        version: 1,
        contentHash: `hash-${index}`,
        createdAt: 1,
        createdBy: "test",
        nodes: index === 6 ? [] : [node("subworkflow", `child-${next}`, {
          workflowId: `workflow-${next}`,
          versionId: `version-${next}`,
          contentHash: `hash-${next}`,
          inputBindings: [],
          outputBindings: [],
        })],
        edges: [],
      });
    }

    expect(validateWorkflowDraft(source, {
      maxNestedDepth: 5,
      workflowVersions: { resolvePublishedVersion: (workflowId, versionId) => versions.get(`${workflowId}:${versionId}`) },
    }).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "subworkflow.depth-limit" }),
    ]));
  });
});
