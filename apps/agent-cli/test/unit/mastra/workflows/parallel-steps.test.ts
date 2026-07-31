import { createStep, createWorkflow } from "@mastra/core/workflows";
import { builtinNodeRegistry, type WorkflowIRGraph, type WorkflowIRParallelNode } from "@orbit/workflow-core";
import { describe, expect, it, vi } from "vitest";
import {
  MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA,
  MASTRA_PARALLEL_BRANCH_RESULTS_SCHEMA,
  MASTRA_PARALLEL_MERGE_INPUT_SCHEMA,
  createMastraParallelPrepareStep,
  createMastraParallelDispatcherWorkflow,
  createMastraParallelForeachWorkflow,
  createMastraParallelMergeStep,
  mergeParallelBranchResults,
  normalizeParallelBranchSuccess,
  resolveParallelConcurrency,
  prepareParallelBranchDescriptors,
} from "../../../../src/mastra/workflows/parallel-steps.js";
import { MASTRA_WORKFLOW_FRAME_SCHEMA, createMastraWorkflowFrame } from "../../../../src/mastra/workflows/frame.js";

const emptyGraph: WorkflowIRGraph = {
  nodes: [],
  edges: [],
  topology: { orderedNodeIds: [], entryNodeIds: [], terminalNodeIds: [], dependencies: {}, dependents: {} },
};

function parallelNode(): WorkflowIRParallelNode {
  const definition = builtinNodeRegistry.get("parallel")!;
  const config = definition.createDefaultConfig();
  config.branches = [{ id: "left", label: "Left" }, { id: "right", label: "Right" }];
  return {
    id: "parallel-1",
    type: "parallel",
    nodeVersion: definition.version,
    label: "并行",
    disabled: false,
    config,
    ports: definition.createPorts(config),
    executor: definition.executor,
    execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" },
    kind: "parallel",
    branches: [
      { id: "right", label: "Right", order: 1, entryNodeId: "right-entry", graph: emptyGraph },
      { id: "left", label: "Left", order: 0, entryNodeId: "left-entry", graph: emptyGraph },
    ],
    merge: { nodeId: "merge-1", strategy: "ordered", allowMissing: false },
  };
}

describe("parallel prepare step", () => {
  it("按 IR order 输出稳定 branch descriptors 和实例 identity", () => {
    const frame = createMastraWorkflowFrame({
      productRunId: "run-1",
      workflowInputs: { name: "Orbit" },
      executionPath: ["root"],
    });
    const first = prepareParallelBranchDescriptors(parallelNode(), frame);
    const second = prepareParallelBranchDescriptors(parallelNode(), frame);

    expect(first.map((descriptor) => descriptor.branchId)).toEqual(["left", "right"]);
    expect(first.map((descriptor) => descriptor.instanceId)).toEqual(second.map((descriptor) => descriptor.instanceId));
    expect(new Set(first.map((descriptor) => descriptor.instanceId)).size).toBe(2);
    expect(first[0]).toMatchObject({
      branchId: "left",
      order: 0,
      entryNodeId: "left-entry",
      frame: {
        productRunId: "run-1",
        workflowInputs: { name: "Orbit" },
        containerId: "parallel-1",
        executionPath: ["root", "parallel-1", "left"],
      },
    });
    expect(MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA.parse(first)).toEqual(first);
  });

  it("作为 Mastra typed step 返回同一有序 descriptors", async () => {
    const node = parallelNode();
    const workflow = createWorkflow({
      id: "parallel-prepare-test",
      inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      outputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA,
    }).then(createMastraParallelPrepareStep(node)).commit();
    const run = await workflow.createRun({ runId: "native-parallel-prepare" });
    const result = await run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-parallel-prepare" }) });

    expect(result).toMatchObject({
      status: "success",
      result: [
        { branchId: "left", order: 0, frame: { containerId: "parallel-1" } },
        { branchId: "right", order: 1, frame: { containerId: "parallel-1" } },
      ],
    });
  });

  it("dispatcher 使用静态 Mastra branch 进入对应 nested Workflow", async () => {
    const node = parallelNode();
    const branchWorkflow = (branchId: string) => createWorkflow({
      id: `parallel-${branchId}-workflow`,
      inputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA.element,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    }).then(createStep({
      id: `parallel-${branchId}-body`,
      inputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA.element,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      execute: async ({ inputData }) => ({ ...inputData.frame, output: { branchId } }),
    })).commit();
    const dispatcher = createMastraParallelDispatcherWorkflow(node, new Map([
      ["left", branchWorkflow("left")],
      ["right", branchWorkflow("right")],
    ]));
    const descriptors = prepareParallelBranchDescriptors(node, createMastraWorkflowFrame({ productRunId: "product-dispatcher" }));

    const leftRun = await dispatcher.createRun({ runId: "native-dispatcher-left" });
    await expect(leftRun.start({ inputData: descriptors[0]! })).resolves.toMatchObject({
      status: "success",
      result: { branchId: "left", order: 0, status: "succeeded", output: { branchId: "left" } },
    });
    const unknownRun = await dispatcher.createRun({ runId: "native-dispatcher-unknown" });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(unknownRun.start({ inputData: { ...descriptors[0]!, branchId: "unknown" } })).resolves.toMatchObject({ status: "failed" });
    } finally {
      errorLog.mockRestore();
    }
  });

  it("foreach resolver 使用节点、IR 与平台上限的最小值", async () => {
    const node = parallelNode();
    node.config.maxConcurrency = 4;
    node.config.branches = ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase() }));
    node.branches = node.config.branches.map((branch, order) => ({
      ...branch,
      order,
      entryNodeId: `${branch.id}-entry`,
      graph: emptyGraph,
    }));
    expect(resolveParallelConcurrency(node, 3)).toBe(3);
    expect(resolveParallelConcurrency(node, 20)).toBe(4);
    node.config.maxConcurrency = 20;
    expect(resolveParallelConcurrency(node, 20)).toBe(10);
    node.config.maxConcurrency = 4;

    let active = 0;
    let maximum = 0;
    const branchWorkflow = (branchId: string) => createWorkflow({
      id: `bounded-${branchId}-workflow`,
      inputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA.element,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    }).then(createStep({
      id: `bounded-${branchId}-body`,
      inputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA.element,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      execute: async ({ inputData }) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { ...inputData.frame, output: { branchId } };
      },
    })).commit();
    const branchWorkflows = new Map(node.branches.map((branch) => [branch.id, branchWorkflow(branch.id)]));
    const dispatcher = createMastraParallelDispatcherWorkflow(node, branchWorkflows);
    const foreach = createMastraParallelForeachWorkflow(node, dispatcher, 2);
    const run = await foreach.createRun({ runId: "native-parallel-bounded" });
    const result = await run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-parallel-bounded" }) });

    expect(result).toMatchObject({ status: "success" });
    expect(maximum).toBe(2);
    if (result.status === "success") expect(result.result.map((branch) => branch.output)).toEqual([
      { branchId: "a" },
      { branchId: "b" },
      { branchId: "c" },
      { branchId: "d" },
    ]);
  });

  it("父取消传播到活动分支，等待分支和 Merge 后继不再启动", async () => {
    const node = parallelNode();
    node.config.maxConcurrency = 2;
    node.config.branches = ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase() }));
    node.branches = node.config.branches.map((branch, order) => ({
      ...branch,
      order,
      entryNodeId: `${branch.id}-entry`,
      graph: emptyGraph,
    }));
    const started: string[] = [];
    const aborted: string[] = [];
    let mergeExecutions = 0;
    let releaseStarted!: () => void;
    const startedReady = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    const branchWorkflow = (branchId: string) => createWorkflow({
      id: `cancel-${branchId}-workflow`,
      inputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA.element,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    }).then(createStep({
      id: `cancel-${branchId}-body`,
      inputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA.element,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      execute: async ({ inputData, abortSignal }) => {
        started.push(branchId);
        if (started.length === 2) releaseStarted();
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 500);
            abortSignal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(abortSignal.reason ?? new Error("parallel cancelled"));
            }, { once: true });
          });
        } catch (error) {
          if (abortSignal.aborted) aborted.push(branchId);
          throw error;
        }
        return { ...inputData.frame, output: { branchId } };
      },
    })).commit();
    const dispatcher = createMastraParallelDispatcherWorkflow(
      node,
      new Map(node.branches.map((branch) => [branch.id, branchWorkflow(branch.id)])),
    );
    const foreach = createMastraParallelForeachWorkflow(node, dispatcher, 2);
    const mergeSuccessor = createStep({
      id: "parallel-merge-successor",
      inputSchema: MASTRA_PARALLEL_BRANCH_RESULTS_SCHEMA,
      outputSchema: MASTRA_PARALLEL_BRANCH_RESULTS_SCHEMA,
      execute: async ({ inputData }) => {
        mergeExecutions += 1;
        return inputData;
      },
    });
    const workflow = createWorkflow({
      id: "parallel-cancel-parent",
      inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      outputSchema: MASTRA_PARALLEL_BRANCH_RESULTS_SCHEMA,
    }).then(foreach as never).then(mergeSuccessor).commit();
    const run = await workflow.createRun({ runId: "native-parallel-cancel" });
    const expectedCancellationLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const completion = run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-parallel-cancel" }) });
      await startedReady;
      await run.cancel();
      await expect(completion).resolves.toMatchObject({ status: "canceled" });
    } finally {
      expectedCancellationLog.mockRestore();
    }

    expect(started).toEqual(["a", "b"]);
    expect(aborted.sort()).toEqual(["a", "b"]);
    expect(mergeExecutions).toBe(0);
  });

  it("Merge 按 ordered/by-branch 确定聚合，并在 collect 中保留结构化失败", async () => {
    const node = parallelNode();
    node.config.failurePolicy = "collect";
    const parent = createMastraWorkflowFrame({ productRunId: "product-merge", executionPath: ["root"] });
    const descriptors = prepareParallelBranchDescriptors(node, parent);
    const leftFrame = { ...descriptors[0]!.frame, nodeOutputs: { "left-entry": { text: "left" } }, output: { text: "left" } };
    const left = normalizeParallelBranchSuccess(node, leftFrame);
    const failed = {
      branchId: "right",
      label: "Right",
      order: 1,
      instanceId: descriptors[1]!.instanceId,
      status: "failed" as const,
      error: { code: "RIGHT_FAILED", message: "right failed" },
      frame: descriptors[1]!.frame,
    };

    const ordered = mergeParallelBranchResults(node, parent, [failed, left]);
    expect(ordered.nodeOutputs["merge-1"]).toEqual({
      result: [
        { branchId: "left", status: "succeeded", output: { text: "left" } },
        { branchId: "right", status: "failed", error: { code: "RIGHT_FAILED", message: "right failed" } },
      ],
    });
    expect(ordered.nodeOutputs).toHaveProperty("left-entry", { text: "left" });
    expect(ordered.executionPath).toEqual(["root"]);

    node.merge.strategy = "by-branch";
    expect(mergeParallelBranchResults(node, parent, [left, failed]).nodeOutputs["merge-1"]).toEqual({
      result: {
        left: { status: "succeeded", output: { text: "left" } },
        right: { status: "failed", error: { code: "RIGHT_FAILED", message: "right failed" } },
      },
    });

    const workflow = createWorkflow({
      id: "parallel-merge-test",
      inputSchema: MASTRA_PARALLEL_MERGE_INPUT_SCHEMA,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    }).then(createMastraParallelMergeStep(node)).commit();
    const run = await workflow.createRun({ runId: "native-parallel-merge" });
    await expect(run.start({ inputData: { frame: parent, results: [left, failed] } })).resolves.toMatchObject({
      status: "success",
      result: { nodeOutputs: { "merge-1": { result: { left: { status: "succeeded" }, right: { status: "failed" } } } } },
    });

    node.config.failurePolicy = "fail-fast";
    expect(() => mergeParallelBranchResults(node, parent, [left, failed])).toThrow(/right failed/);
  });
});
