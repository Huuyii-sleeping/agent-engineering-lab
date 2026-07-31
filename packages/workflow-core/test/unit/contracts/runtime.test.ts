import { describe, expect, it } from "vitest";
import { builtinNodeRegistry } from "../../../src/registry/builtins.js";
import {
  DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES,
  normalizeWorkflowStageECapabilities,
  requiredWorkflowStageECapabilities,
  applyWorkflowRuntimeEventToSnapshot,
  projectWorkflowRuntimeEvents,
  type WorkflowRunSnapshot,
} from "../../../src/contracts/runtime.js";

const run: WorkflowRunSnapshot = {
  id: "run-1",
  workflowId: "workflow-1",
  mode: "draft",
  status: "running",
  createdAt: 1,
  inputs: {},
  nodeRuns: { agent: { nodeId: "agent", status: "pending", attempt: 0 } },
};

describe("workflow runtime projection", () => {
  it("以固定七项能力矩阵递归映射阶段 E 节点，且只关闭未通过的 Parallel/Merge", () => {
    const iteration = builtinNodeRegistry.get("iteration")!;
    const approval = builtinNodeRegistry.get("human-approval")!;
    const iterationConfig = iteration.createDefaultConfig();
    const approvalConfig = approval.createDefaultConfig();
    iterationConfig.body.nodes = [{
      kind: "builtin",
      id: "approval",
      type: "human-approval",
      version: approval.version,
      label: "审批",
      position: { x: 0, y: 0 },
      config: approvalConfig,
      ports: approval.createPorts(approvalConfig),
    }];
    const nodes = [{
      kind: "builtin" as const,
      id: "iteration",
      type: "iteration" as const,
      version: iteration.version,
      label: "迭代",
      position: { x: 0, y: 0 },
      config: iterationConfig,
      ports: iteration.createPorts(iterationConfig),
    }];

    expect(DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES).toEqual({
      parallelMerge: false,
      iteration: true,
      boundedLoop: true,
      nestedWorkflow: true,
      agentNode: true,
      humanApproval: true,
      restartResume: true,
    });
    expect(requiredWorkflowStageECapabilities(nodes)).toEqual(["iteration", "humanApproval", "restartResume"]);
    expect(normalizeWorkflowStageECapabilities({ iteration: true })).toMatchObject({
      iteration: true,
      parallelMerge: false,
      humanApproval: true,
    });
    expect(normalizeWorkflowStageECapabilities({ iteration: false })).toMatchObject({
      iteration: false,
      parallelMerge: false,
      humanApproval: true,
    });
  });

  it("按 nodeId + instanceId 投影容器实例和 child run", () => {
    const projected = projectWorkflowRuntimeEvents(run, [
      {
        id: 2,
        runId: "run-1",
        at: 20,
        type: "node.output",
        nodeId: "agent",
        instanceId: "iteration-1:item-0",
        containerId: "iteration-1",
        iterationIndex: 0,
        executionPath: ["iteration-1", "agent"],
        childRunId: "child-1",
        output: { text: "done" },
      },
      {
        id: 1,
        runId: "run-1",
        at: 10,
        type: "node.status",
        nodeId: "agent",
        instanceId: "iteration-1:item-0",
        containerId: "iteration-1",
        iterationIndex: 0,
        executionPath: ["iteration-1", "agent"],
        childRunId: "child-1",
        status: "running",
        attempt: 1,
      },
    ]);

    expect(projected.nodeInstances?.["agent::iteration-1:item-0"]).toMatchObject({
      nodeId: "agent",
      instanceId: "iteration-1:item-0",
      iterationIndex: 0,
      status: "running",
      output: { text: "done" },
    });
    expect(projected.childRuns?.["child-1"]).toMatchObject({
      childRunId: "child-1",
      parentNodeId: "agent",
      status: "running",
      output: { text: "done" },
    });
  });

  it("投影脱敏 waiting metadata，并在恢复运行后清除", () => {
    const waiting = applyWorkflowRuntimeEventToSnapshot(run, {
      id: 1,
      runId: "run-1",
      at: 10,
      type: "run.waiting",
      nodeId: "approval",
      reason: "Human approval pending",
      waiting: {
        kind: "approval",
        interruptId: "interrupt-1",
        approvalRequestId: "interrupt-1",
        deadline: 100,
        displayFields: [{ id: "summary", label: "摘要", value: "已脱敏" }],
        decisionSchema: { type: "object", additionalProperties: false },
      },
    });
    expect(waiting.waiting).toEqual({
      nodeId: "approval",
      reason: "Human approval pending",
      waiting: {
        kind: "approval",
        interruptId: "interrupt-1",
        approvalRequestId: "interrupt-1",
        deadline: 100,
        displayFields: [{ id: "summary", label: "摘要", value: "已脱敏" }],
        decisionSchema: { type: "object", additionalProperties: false },
      },
    });
    expect(JSON.stringify(waiting.waiting)).not.toMatch(/token|nativeRunId|snapshot/i);
    expect(applyWorkflowRuntimeEventToSnapshot(waiting, {
      id: 2,
      runId: "run-1",
      at: 20,
      type: "run.status",
      status: "running",
    }).waiting).toBeUndefined();
  });
});
