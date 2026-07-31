import { describe, expect, it } from "vitest";
import {
  mapMastraWorkflowResult,
  safeWorkflowRequestContext,
} from "../../../../src/mastra/adapters/workflow-result-mapper.js";

const record = {
  snapshot: {
    id: "run-1",
    workflowId: "workflow-1",
    mode: "draft" as const,
    status: "running" as const,
    createdAt: 1,
    startedAt: 1,
    inputs: {},
    nodeRuns: { node: { nodeId: "node", status: "pending" as const, attempt: 0 } },
  },
  nativeRunId: "native-1",
  runtimeWorkflowId: "runtime-1",
  ir: {
    irVersion: 1 as const,
    schemaVersion: 2 as const,
    source: { kind: "draft" as const, workflowId: "workflow-1", revision: 1, migrated: false },
    nodes: [{
      id: "node",
      type: "template" as const,
      nodeVersion: 1,
      label: "node",
      disabled: false,
      config: { template: "", variables: {} },
      ports: { inputs: [], outputs: [] },
      executor: { id: "workflow.template", version: 1 },
      execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" as const },
    }],
    edges: [],
    topology: {
      orderedNodeIds: ["node"],
      entryNodeIds: ["node"],
      terminalNodeIds: ["node"],
      dependencies: { node: [] },
      dependents: { node: [] },
    },
    resourceBudget: {
      limits: { maxNodes: 1, maxEdges: 1, maxEstimatedSteps: 1, maxParallelism: 1, maxRuntimeMs: 1_000, maxOutputBytes: 1_000 },
      estimate: { nodeCount: 1, edgeCount: 0, estimatedSteps: 1, maxParallelism: 1 },
    },
    dependencies: [{ nodeType: "template" as const, nodeVersion: 1, executor: { id: "workflow.template", version: 1 } }],
  },
};

describe("mastra/adapters/workflow-result-mapper", () => {
  it("将 suspended/paused 映射为 waiting", () => {
    expect(mapMastraWorkflowResult(record, {
      status: "paused",
      steps: { node: { status: "paused", startedAt: 2 } },
    }, false, 3)).toMatchObject({
      status: "waiting",
      nodeRuns: { node: { status: "waiting" } },
    });
  });

  it("将 tripwire 映射为结构化 failed，并过滤快照 request context 中的凭据", () => {
    expect(mapMastraWorkflowResult(record, {
      status: "tripwire",
      tripwire: { reason: "policy rejected", metadata: { processorId: "guard" } },
      steps: { node: { status: "failed", error: new Error("blocked") } },
    }, false, 3)).toMatchObject({
      status: "failed",
      error: {
        code: "MASTRA_WORKFLOW_TRIPWIRE",
        message: "policy rejected",
        details: { processorId: "guard" },
      },
    });
    expect(safeWorkflowRequestContext({
      ownerId: "owner-1",
      traceId: "trace-1",
      authorization: "Bearer secret",
      apiKey: "secret",
    })).toEqual({ ownerId: "owner-1", traceId: "trace-1" });
  });

  it("保留 Subworkflow 父节点、child run 与内部节点结构化错误链", () => {
    const error = Object.assign(new Error("child failed"), {
      code: "CHILD_FAILED",
      details: {
        parentNodeId: "subworkflow",
        childRunId: "workflow-child-1",
        childVersionId: "child-v1",
        internalNodeId: "child-template",
        executionPath: ["subworkflow", "child-template"],
      },
    });
    const subworkflowRecord = {
      ...record,
      snapshot: {
        ...record.snapshot,
        nodeRuns: { subworkflow: { nodeId: "subworkflow", status: "pending" as const, attempt: 0 } },
      },
      ir: {
        ...record.ir,
        irVersion: 2 as const,
        nodes: [{
          kind: "subworkflow" as const,
          id: "subworkflow",
          type: "subworkflow" as const,
          nodeVersion: 1,
          label: "子流程",
          disabled: false,
          config: { workflowId: "child", versionId: "child-v1", contentHash: "child-hash", inputBindings: [], outputBindings: [] },
          ports: { inputs: [], outputs: [] },
          executor: { id: "workflow.subworkflow", version: 1 },
          execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" as const },
          dependency: { workflowId: "child", versionId: "child-v1", version: 1, contentHash: "child-hash" },
          workflow: { nodes: [], edges: [], topology: { orderedNodeIds: [], entryNodeIds: [], terminalNodeIds: [], dependencies: {}, dependents: {} } },
        }],
        topology: {
          orderedNodeIds: ["subworkflow"],
          entryNodeIds: ["subworkflow"],
          terminalNodeIds: ["subworkflow"],
          dependencies: { subworkflow: [] },
          dependents: { subworkflow: [] },
        },
      },
    };

    expect(mapMastraWorkflowResult(subworkflowRecord, {
      status: "failed",
      steps: { "subworkflow-container": { status: "failed", error } },
      error,
    }, false, 3)).toMatchObject({
      status: "failed",
      error: {
        code: "CHILD_FAILED",
        nodeId: "subworkflow",
        details: {
          parentNodeId: "subworkflow",
          childRunId: "workflow-child-1",
          childVersionId: "child-v1",
          internalNodeId: "child-template",
          executionPath: ["subworkflow", "child-template"],
        },
      },
      nodeRuns: {
        subworkflow: {
          status: "failed",
          error: {
            code: "CHILD_FAILED",
            nodeId: "subworkflow",
          },
        },
      },
    });
  });
});
