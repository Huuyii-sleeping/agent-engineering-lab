import { describe, expect, it } from "vitest";
import type { WorkflowRunSnapshot } from "@orbit/workflow-core";
import { appendWorkflowRuntimeEvent, applyWorkflowRuntimeEvent } from "./run-state";

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
});
