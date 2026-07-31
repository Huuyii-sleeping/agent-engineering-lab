import type { WorkflowIRSubworkflowNode } from "@orbit/workflow-core";
import { describe, expect, it } from "vitest";
import {
  deriveSubworkflowChildRunId,
  mergeSubworkflowFrame,
  prepareSubworkflowFrame,
} from "../../../../src/mastra/workflows/subworkflow-steps.js";
import { createMastraWorkflowFrame } from "../../../../src/mastra/workflows/frame.js";

function subworkflowNode(): WorkflowIRSubworkflowNode {
  return {
    kind: "subworkflow",
    id: "subworkflow",
    type: "subworkflow",
    nodeVersion: 1,
    label: "子流程",
    disabled: false,
    config: {
      workflowId: "child",
      versionId: "child-v1",
      contentHash: "child-hash",
      inputBindings: [{
        inputId: "name",
        value: { kind: "variable", ref: { scope: "workflow-input", inputId: "parentName" } },
      }],
      outputBindings: [{ outputId: "message", name: "消息", dataType: "string" }],
    },
    ports: { inputs: [], outputs: [] },
    executor: { id: "workflow.subworkflow", version: 1 },
    execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" },
    dependency: { workflowId: "child", versionId: "child-v1", version: 1, contentHash: "child-hash" },
    workflow: {
      nodes: [],
      edges: [],
      topology: { orderedNodeIds: [], entryNodeIds: [], terminalNodeIds: [], dependencies: {}, dependents: {} },
    },
  };
}

describe("mastra/workflows/subworkflow-steps", () => {
  it("从显式绑定创建隔离 child frame，并稳定派生 node instance、childRunId 与 executionPath", async () => {
    const node = subworkflowNode();
    const parent = createMastraWorkflowFrame({
      productRunId: "parent-run",
      workflowInputs: { parentName: "Orbit" },
      requestContext: { ownerId: "owner-1" },
      executionPath: ["iteration", "0"],
      containerId: "iteration",
      instanceId: "iteration-instance-0",
      iterationIndex: 0,
    });
    parent.nodeOutputs.parent = { hidden: true };

    const first = await prepareSubworkflowFrame(node, parent);
    const replay = await prepareSubworkflowFrame(node, structuredClone(parent));

    expect(first).toMatchObject({
      productRunId: "parent-run",
      workflowInputs: { name: "Orbit" },
      requestContext: { ownerId: "owner-1" },
      containerId: "subworkflow",
      executionPath: ["iteration", "0", "subworkflow"],
      nodeOutputs: {},
      selectedPorts: {},
      skippedNodeIds: [],
    });
    expect(first.instanceId).toMatch(/^subworkflow-node-/);
    expect(first.childRunId).toMatch(/^workflow-child-/);
    expect(replay.instanceId).toBe(first.instanceId);
    expect(replay.childRunId).toBe(first.childRunId);
    expect(deriveSubworkflowChildRunId("parent-run", first.instanceId!, "child-v2")).not.toBe(first.childRunId);
  });

  it("只将声明输出写回父 frame，并在失败时保留结构化 child 错误链", () => {
    const node = subworkflowNode();
    const parent = createMastraWorkflowFrame({ productRunId: "parent-run", executionPath: ["root"] });
    parent.nodeOutputs.parent = { keep: true };
    const child = createMastraWorkflowFrame({
      productRunId: "parent-run",
      containerId: "subworkflow",
      instanceId: "subworkflow-node-1",
      executionPath: ["root", "subworkflow"],
      childRunId: "workflow-child-1",
    });
    child.output = { message: "done", hidden: "internal" };

    expect(mergeSubworkflowFrame(node, parent, child)).toMatchObject({
      executionPath: ["root"],
      nodeOutputs: {
        parent: { keep: true },
        subworkflow: { "output:message": "done" },
      },
    });

    child.instanceFailure = { code: "CHILD_FAILED", message: "child failed", nodeId: "child-template" };
    expect(() => mergeSubworkflowFrame(node, parent, child)).toThrow(expect.objectContaining({
      code: "CHILD_FAILED",
      nodeId: "subworkflow",
      details: {
        parentNodeId: "subworkflow",
        childRunId: "workflow-child-1",
        childVersionId: "child-v1",
        internalNodeId: "child-template",
        executionPath: ["root", "subworkflow", "child-template"],
      },
    }));
  });
});
