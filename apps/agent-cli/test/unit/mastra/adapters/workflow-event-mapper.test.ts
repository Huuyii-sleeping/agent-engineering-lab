import { describe, expect, it } from "vitest";
import type { WorkflowIR, WorkflowRunSnapshot } from "@orbit/workflow-core";
import { ChunkFrom } from "@mastra/core/stream";
import { MastraWorkflowEventMapper } from "../../../../src/mastra/adapters/workflow-event-mapper.js";

const initial: WorkflowRunSnapshot = {
  id: "product-run",
  workflowId: "workflow-1",
  mode: "draft",
  status: "running",
  createdAt: 1,
  startedAt: 1,
  inputs: {},
  nodeRuns: {
    start: { nodeId: "start", status: "pending", attempt: 0 },
    template: { nodeId: "template", status: "pending", attempt: 0 },
  },
};

const subworkflowIr = {
  irVersion: 2,
  schemaVersion: 2,
  source: { kind: "version", workflowId: "parent", versionId: "parent-v1", version: 1, contentHash: "parent-hash" },
  nodes: [{
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
      inputBindings: [],
      outputBindings: [],
    },
    ports: { inputs: [], outputs: [] },
    executor: { id: "workflow.subworkflow", version: 1 },
    execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" },
    dependency: { workflowId: "child", versionId: "child-v1", version: 1, contentHash: "child-hash" },
    workflow: {
      nodes: [{
        kind: "executable",
        id: "child-template",
        type: "template",
        nodeVersion: 1,
        label: "内部模板",
        disabled: false,
        config: { template: "child", variables: {} },
        ports: { inputs: [], outputs: [] },
        executor: { id: "workflow.template", version: 1 },
        execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" },
      }],
      edges: [],
      topology: {
        orderedNodeIds: ["child-template"],
        entryNodeIds: ["child-template"],
        terminalNodeIds: ["child-template"],
        dependencies: { "child-template": [] },
        dependents: { "child-template": [] },
      },
    },
  }],
  edges: [],
  topology: {
    orderedNodeIds: ["subworkflow"],
    entryNodeIds: ["subworkflow"],
    terminalNodeIds: ["subworkflow"],
    dependencies: { subworkflow: [] },
    dependents: { subworkflow: [] },
  },
  resourceBudget: {
    limits: {
      maxNodes: 200,
      maxEdges: 400,
      maxEstimatedSteps: 1_000,
      maxParallelism: 10,
      maxRuntimeMs: 86_400_000,
      maxOutputBytes: 1_048_576,
      maxIterationItems: 1_000,
      maxLoopIterations: 1_000,
      maxNestedDepth: 5,
      maxWaitingMs: 2_592_000_000,
    },
    estimate: { nodeCount: 2, edgeCount: 0, estimatedSteps: 2, maxParallelism: 1, maxNestedDepth: 1 },
  },
  dependencies: [{ kind: "workflow-version", workflowId: "child", versionId: "child-v1", version: 1, contentHash: "child-hash" }],
} satisfies WorkflowIR;

describe("mastra/adapters/workflow-event-mapper", () => {
  it("将乱序 Workflow chunk 归一化为产品事件且重复 chunk 只映射一次", () => {
    const mapper = new MastraWorkflowEventMapper({ nativeRunId: "native-run" });
    const result = {
      type: "workflow-step-result" as const,
      runId: "native-run",
      from: ChunkFrom.WORKFLOW,
      payload: {
        id: "template",
        stepCallId: "call-template",
        status: "success" as const,
        output: { text: "done" },
      },
    };

    expect(mapper.mapChunk(result)).toEqual([
      { type: "node.status", nodeId: "template", status: "succeeded", attempt: 1 },
      { type: "node.output", nodeId: "template", output: { text: "done" } },
    ]);
    expect(mapper.mapChunk({
      type: "workflow-step-start",
      runId: "native-run",
      from: ChunkFrom.WORKFLOW,
      id: "start",
      payload: { id: "start", stepCallId: "call-start", status: "running" },
    })).toEqual([
      { type: "node.status", nodeId: "start", status: "running", attempt: 1 },
    ]);
    expect(mapper.mapChunk(result)).toEqual([]);
  });

  it("将 suspend 和最终 snapshot 通过同一映射器收敛为 waiting 与终态事件", () => {
    const mapper = new MastraWorkflowEventMapper({ nativeRunId: "native-run" });

    expect(mapper.mapChunk({
      type: "workflow-step-suspended",
      runId: "native-run",
      from: ChunkFrom.WORKFLOW,
      payload: {
        id: "template",
        status: "suspended",
        suspendPayload: {
          kind: "approval",
          reason: "approval",
          interruptId: "interrupt-1",
          approvalRequestId: "interrupt-1",
          deadline: 2_000,
          displayFields: [{ id: "summary", label: "摘要", value: "已脱敏" }],
          decisionSchema: {
            type: "object",
            properties: { comment: { type: "string" } },
            required: ["comment"],
            additionalProperties: false,
          },
        },
      },
    })).toEqual([
      { type: "node.status", nodeId: "template", status: "waiting", attempt: 1 },
      {
        type: "run.waiting",
        nodeId: "template",
        reason: "approval",
        waiting: {
          kind: "approval",
          interruptId: "interrupt-1",
          approvalRequestId: "interrupt-1",
          deadline: 2_000,
          displayFields: [{ id: "summary", label: "摘要", value: "已脱敏" }],
          decisionSchema: {
            type: "object",
            properties: { comment: { type: "string" } },
            required: ["comment"],
            additionalProperties: false,
          },
        },
      },
    ]);
    expect(JSON.stringify(mapper.mapChunk({
      type: "workflow-step-waiting",
      runId: "native-run",
      from: ChunkFrom.WORKFLOW,
      payload: { id: "template", status: "waiting", payload: {} },
    }))).not.toMatch(/resumeToken|checkpoint|snapshot-secret/);

    const succeeded: WorkflowRunSnapshot = {
      ...initial,
      status: "succeeded",
      finishedAt: 2,
      output: { text: "done" },
      nodeRuns: {
        start: { nodeId: "start", status: "succeeded", attempt: 1, output: {} },
        template: { nodeId: "template", status: "succeeded", attempt: 1, output: { text: "done" } },
      },
    };
    expect(mapper.mapSnapshotDelta(initial, succeeded)).toEqual([
      { type: "node.status", nodeId: "start", status: "succeeded", attempt: 1 },
      { type: "node.output", nodeId: "start", output: {} },
      { type: "node.status", nodeId: "template", status: "succeeded", attempt: 1 },
      { type: "node.output", nodeId: "template", output: { text: "done" } },
      { type: "run.output", output: { text: "done" } },
      { type: "run.status", status: "succeeded" },
    ]);
  });

  it("拒绝其他 Mastra run 的原生 chunk", () => {
    const mapper = new MastraWorkflowEventMapper({ nativeRunId: "native-run" });

    expect(() => mapper.mapChunk({
      type: "workflow-start",
      runId: "other-run",
      from: ChunkFrom.WORKFLOW,
      payload: { workflowId: "workflow-1" },
    })).toThrow("Mastra Workflow runId 不一致");
  });

  it("将 foreach progress 归一化为带稳定实例身份的节点事件", () => {
    const mapper = new MastraWorkflowEventMapper({ nativeRunId: "native-run" });

    expect(mapper.mapChunk({
      type: "workflow-step-progress",
      runId: "native-run",
      from: ChunkFrom.WORKFLOW,
      payload: {
        id: "iteration-body",
        completedCount: 2,
        totalCount: 3,
        currentIndex: 1,
        iterationStatus: "success",
        iterationOutput: {
          index: 1,
          instanceId: "iteration-instance-1",
          status: "succeeded",
          output: "second",
          frame: {
            productRunId: "product-run",
            workflowInputs: {},
            requestContext: {},
            containerId: "iteration-1",
            instanceId: "iteration-instance-1",
            iterationIndex: 1,
            executionPath: ["iteration-1", "1"],
            nodeOutputs: {},
            selectedPorts: {},
            skippedNodeIds: [],
          },
        },
      },
    })).toEqual([
      {
        type: "node.status",
        nodeId: "iteration-1",
        status: "succeeded",
        attempt: 1,
        containerId: "iteration-1",
        instanceId: "iteration-instance-1",
        iterationIndex: 1,
        executionPath: ["iteration-1", "1"],
      },
      {
        type: "node.log",
        nodeId: "iteration-1",
        level: "info",
        message: "index 1 2/3 succeeded",
        containerId: "iteration-1",
        instanceId: "iteration-instance-1",
        iterationIndex: 1,
        executionPath: ["iteration-1", "1"],
      },
      {
        type: "node.output",
        nodeId: "iteration-1",
        output: { value: "second" },
        containerId: "iteration-1",
        instanceId: "iteration-instance-1",
        iterationIndex: 1,
        executionPath: ["iteration-1", "1"],
      },
    ]);
  });

  it("将 nested Subworkflow 内部节点事件映射到逻辑 child identity 与 executionPath", () => {
    const mapper = new MastraWorkflowEventMapper({ nativeRunId: "native-run", ir: subworkflowIr });

    expect(mapper.mapChunk({
      type: "workflow-step-result",
      runId: "native-run",
      from: ChunkFrom.WORKFLOW,
      payload: {
        id: "subworkflow-container.child-runtime.child-template",
        stepCallId: "child-call",
        status: "success",
        output: {
          productRunId: "product-run",
          workflowInputs: {},
          requestContext: {},
          containerContexts: {},
          containerId: "subworkflow",
          instanceId: "subworkflow-node-1",
          executionPath: ["subworkflow"],
          childRunId: "workflow-child-1",
          nodeOutputs: { "child-template": { text: "done" } },
          selectedPorts: {},
          skippedNodeIds: [],
        },
      },
    })).toEqual([
      {
        type: "node.status",
        nodeId: "child-template",
        status: "succeeded",
        attempt: 1,
        containerId: "subworkflow",
        instanceId: "subworkflow-node-1",
        executionPath: ["subworkflow", "child-template"],
        childRunId: "workflow-child-1",
      },
      {
        type: "node.output",
        nodeId: "child-template",
        output: { text: "done" },
        containerId: "subworkflow",
        instanceId: "subworkflow-node-1",
        executionPath: ["subworkflow", "child-template"],
        childRunId: "workflow-child-1",
      },
    ]);
  });

  it("将 Agent outputWriter 信号映射为带 child identity 的脱敏 delta 与日志", () => {
    const mapper = new MastraWorkflowEventMapper({ nativeRunId: "native-run" });
    const delta = {
      type: "orbit-workflow-node-event",
      payload: {
        kind: "delta",
        nodeId: "agent",
        delta: "same",
        childRunId: "agent-child-1",
        executionPath: ["agent"],
      },
    };

    expect(mapper.mapOutput(delta)).toEqual([{
      type: "node.output",
      nodeId: "agent",
      output: { delta: "same" },
      delta: "same",
      childRunId: "agent-child-1",
      executionPath: ["agent"],
    }]);
    expect(mapper.mapOutput(delta)).toEqual([{
      type: "node.output",
      nodeId: "agent",
      output: { delta: "same" },
      delta: "same",
      childRunId: "agent-child-1",
      executionPath: ["agent"],
    }]);
    expect(mapper.mapOutput({
      type: "orbit-workflow-node-event",
      payload: {
        kind: "log",
        nodeId: "agent",
        level: "info",
        message: "Agent Tool read-file succeeded",
        childRunId: "agent-child-1",
        executionPath: ["agent"],
      },
    })).toEqual([{
      type: "node.log",
      nodeId: "agent",
      level: "info",
      message: "Agent Tool read-file succeeded",
      childRunId: "agent-child-1",
      executionPath: ["agent"],
    }]);
  });
});
