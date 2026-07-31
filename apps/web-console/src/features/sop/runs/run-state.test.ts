import { describe, expect, it } from "vitest";
import type { WorkflowRunSnapshot } from "@orbit/workflow-core";
import { appendWorkflowRuntimeEvent, applyWorkflowRuntimeEvent, selectWorkflowNodeInstances } from "./run-state";

const run: WorkflowRunSnapshot = {
  id: "run-1",
  workflowId: "workflow-1",
  mode: "draft",
  status: "queued",
  createdAt: 1,
  inputs: {},
  nodeRuns: { node1: { nodeId: "node1", status: "pending", attempt: 0 } },
};

describe("workflow run state", () => {
  it("合并节点状态、attempt 和错误定位", () => {
    const next = applyWorkflowRuntimeEvent(run, {
      id: 2,
      runId: run.id,
      at: 20,
      type: "node.status",
      nodeId: "node1",
      status: "failed",
      attempt: 3,
      error: { code: "NODE_FAILED", message: "boom", nodeId: "node1", attempt: 3 },
    });
    expect(next.nodeRuns.node1).toMatchObject({ status: "failed", attempt: 3, error: { nodeId: "node1", attempt: 3 } });
  });

  it("SSE 重连事件按 id 去重并保持顺序", () => {
    const second = { id: 2, runId: run.id, at: 2, type: "run.status", status: "running" } as const;
    const first = { id: 1, runId: run.id, at: 1, type: "run.status", status: "queued" } as const;
    expect(appendWorkflowRuntimeEvent(appendWorkflowRuntimeEvent([second], first), second).map((event) => event.id)).toEqual([1, 2]);
  });

  it("按 nodeId + instanceId 分离容器实例，并保留 child run 与审批 waiting", () => {
    const running = applyWorkflowRuntimeEvent(run, {
      id: 3,
      runId: run.id,
      at: 30,
      type: "node.status",
      nodeId: "node1",
      status: "running",
      attempt: 1,
      containerId: "iteration-1",
      instanceId: "item-0",
      iterationIndex: 0,
      executionPath: ["iteration-1", "node1"],
      childRunId: "child-1",
    });
    const waiting = applyWorkflowRuntimeEvent(running, {
      id: 4,
      runId: run.id,
      at: 40,
      type: "run.waiting",
      nodeId: "approval",
      reason: "Human approval pending",
      waiting: {
        kind: "approval",
        interruptId: "approval-1",
        approvalRequestId: "approval-1",
        deadline: 100,
        displayFields: [],
        decisionSchema: { type: "object" },
      },
    });

    expect(waiting.nodeInstances?.["node1::item-0"]).toMatchObject({ instanceId: "item-0", iterationIndex: 0 });
    expect(waiting.childRuns?.["child-1"]).toMatchObject({ parentNodeId: "node1", status: "running" });
    expect(waiting.waiting?.waiting).toEqual({
      kind: "approval",
      interruptId: "approval-1",
      approvalRequestId: "approval-1",
      deadline: 100,
      displayFields: [],
      decisionSchema: { type: "object" },
    });
  });

  it("按 nodeId + instanceId 去重，并按 iteration index 稳定排序", () => {
    const events = [
      { id: 1, runId: run.id, at: 10, type: "node.status", nodeId: "node2", status: "running", attempt: 1, instanceId: "item-1", iterationIndex: 1 },
      { id: 2, runId: run.id, at: 20, type: "node.status", nodeId: "node1", status: "running", attempt: 1, instanceId: "item-2", iterationIndex: 2 },
      { id: 3, runId: run.id, at: 30, type: "node.status", nodeId: "node1", status: "succeeded", attempt: 1, instanceId: "item-2", iterationIndex: 2 },
      { id: 4, runId: run.id, at: 40, type: "node.status", nodeId: "node1", status: "running", attempt: 1, instanceId: "item-0", iterationIndex: 0 },
    ] as const;
    const projected = events.reduce(applyWorkflowRuntimeEvent, run);

    expect(selectWorkflowNodeInstances(projected).map((instance) => `${instance.nodeId}:${instance.instanceId}:${instance.status}`)).toEqual([
      "node1:item-0:running",
      "node1:item-2:succeeded",
      "node2:item-1:running",
    ]);
  });
});
