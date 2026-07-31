import { createHash } from "node:crypto";
import type { WorkflowIRParallelNode } from "@orbit/workflow-core";
import { createStep, createWorkflow, type AnyWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  MASTRA_WORKFLOW_FRAME_SCHEMA,
  createMastraBranchMergeStep,
  type MastraWorkflowFrame,
  withMastraWorkflowExecutionIdentity,
} from "./frame.js";

/** Parallel foreach dispatcher 消费的稳定静态分支描述。 */
export type MastraParallelBranchDescriptor = {
  parallelNodeId: string;
  branchId: string;
  label: string;
  order: number;
  entryNodeId: string;
  instanceId: string;
  frame: MastraWorkflowFrame;
};

export const MASTRA_PARALLEL_BRANCH_DESCRIPTOR_SCHEMA = z.object({
  parallelNodeId: z.string(),
  branchId: z.string(),
  label: z.string(),
  order: z.number().int().nonnegative(),
  entryNodeId: z.string(),
  instanceId: z.string(),
  frame: MASTRA_WORKFLOW_FRAME_SCHEMA,
});

export const MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA = z.array(MASTRA_PARALLEL_BRANCH_DESCRIPTOR_SCHEMA);

const MASTRA_PARALLEL_ERROR_SCHEMA = z.object({
  code: z.string(),
  message: z.string(),
});

export const MASTRA_PARALLEL_BRANCH_RESULT_SCHEMA = z.discriminatedUnion("status", [
  z.object({
    branchId: z.string(),
    label: z.string(),
    order: z.number().int().nonnegative(),
    instanceId: z.string(),
    status: z.literal("succeeded"),
    output: z.unknown().optional(),
    frame: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }),
  z.object({
    branchId: z.string(),
    label: z.string(),
    order: z.number().int().nonnegative(),
    instanceId: z.string(),
    status: z.literal("failed"),
    error: MASTRA_PARALLEL_ERROR_SCHEMA,
    frame: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }),
  z.object({
    branchId: z.string(),
    label: z.string(),
    order: z.number().int().nonnegative(),
    instanceId: z.string().optional(),
    status: z.literal("skipped"),
  }),
]);

export type MastraParallelBranchResult = z.infer<typeof MASTRA_PARALLEL_BRANCH_RESULT_SCHEMA>;

export const MASTRA_PARALLEL_BRANCH_RESULTS_SCHEMA = z.array(MASTRA_PARALLEL_BRANCH_RESULT_SCHEMA);

export const MASTRA_PARALLEL_MERGE_INPUT_SCHEMA = z.object({
  frame: MASTRA_WORKFLOW_FRAME_SCHEMA,
  results: MASTRA_PARALLEL_BRANCH_RESULTS_SCHEMA,
});

function parallelInstanceId(productRunId: string, parallelNodeId: string, branchId: string): string {
  const digest = createHash("sha256")
    .update(productRunId)
    .update("\0")
    .update(parallelNodeId)
    .update("\0")
    .update(branchId)
    .digest("hex")
    .slice(0, 24);
  return `parallel-${digest}`;
}

/** 按 IR order 将父 frame 转换为确定性 branch descriptors。 */
export function prepareParallelBranchDescriptors(
  node: WorkflowIRParallelNode,
  frame: MastraWorkflowFrame,
): MastraParallelBranchDescriptor[] {
  return [...node.branches]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((branch) => {
      const instanceId = parallelInstanceId(frame.productRunId, node.id, branch.id);
      return {
        parallelNodeId: node.id,
        branchId: branch.id,
        label: branch.label,
        order: branch.order,
        entryNodeId: branch.entryNodeId,
        instanceId,
        frame: withMastraWorkflowExecutionIdentity(frame, {
          containerId: node.id,
          instanceId,
          executionPath: [...frame.executionPath, node.id, branch.id],
        }),
      };
    });
}

/** 创建 Parallel 的 Mastra typed prepare step。 */
export function createMastraParallelPrepareStep(node: WorkflowIRParallelNode) {
  return createStep({
    id: `${node.id}-prepare`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTORS_SCHEMA,
    execute: async ({ inputData }) => prepareParallelBranchDescriptors(node, inputData),
  });
}

/** 创建按 branchId 分发到静态 nested Workflow 的 Mastra dispatcher。 */
export function createMastraParallelDispatcherWorkflow(
  node: WorkflowIRParallelNode,
  branchWorkflows: ReadonlyMap<string, AnyWorkflow>,
): AnyWorkflow {
  const branches = [...node.branches]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((branch) => {
      const workflow = branchWorkflows.get(branch.id);
      if (!workflow) throw new Error(`Parallel ${node.id} 缺少分支 ${branch.id} 的 nested Workflow。`);
      return [
        async ({ inputData }: { inputData: MastraParallelBranchDescriptor }) => inputData.branchId === branch.id,
        workflow,
      ] as const;
    });
  const dispatcherId = `${node.id}-dispatcher`;
  return (createWorkflow({
    id: dispatcherId,
    inputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTOR_SCHEMA,
    outputSchema: MASTRA_PARALLEL_BRANCH_RESULT_SCHEMA,
  }) as AnyWorkflow)
    .branch(branches as never)
    .then(createMastraBranchMergeStep(
      `${dispatcherId}-merge`,
      branches.map((branch) => branch[1].id),
    ) as never)
    .then(createMastraParallelBranchResultStep(node) as never)
    .commit();
}

function createMastraParallelBranchFrameStep(node: WorkflowIRParallelNode, branchId: string) {
  return createStep({
    id: `${node.id}-${branchId}-branch-frame`,
    inputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTOR_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => inputData.frame,
  });
}

/** 将已编译 frame Workflow 包装为 dispatcher 可消费的静态 Parallel 分支。 */
export function createMastraParallelBranchWorkflow(
  node: WorkflowIRParallelNode,
  branchId: string,
  branchFrameWorkflow: AnyWorkflow,
): AnyWorkflow {
  return (createWorkflow({
    id: `${branchFrameWorkflow.id}-${node.id}-${branchId}-parallel-branch`,
    inputSchema: MASTRA_PARALLEL_BRANCH_DESCRIPTOR_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }) as AnyWorkflow)
    .then(createMastraParallelBranchFrameStep(node, branchId) as never)
    .then(branchFrameWorkflow as never)
    .commit();
}

function branchOutput(node: WorkflowIRParallelNode, branchId: string, frame: MastraWorkflowFrame): unknown {
  const branch = node.branches.find((candidate) => candidate.id === branchId);
  if (!branch) throw new Error(`Parallel ${node.id} 收到未知分支 ${branchId}。`);
  const terminalIds = branch.graph.topology.terminalNodeIds;
  if (terminalIds.length === 1) return frame.nodeOutputs[terminalIds[0]!] ?? frame.output;
  if (terminalIds.length > 1) return Object.fromEntries(terminalIds.map((nodeId) => [nodeId, frame.nodeOutputs[nodeId]]));
  return frame.output;
}

/** 将 dispatcher 成功 frame 规范化为带稳定 branch identity 的结果。 */
export function normalizeParallelBranchSuccess(
  node: WorkflowIRParallelNode,
  frame: MastraWorkflowFrame,
): Extract<MastraParallelBranchResult, { status: "succeeded" }> {
  const branchId = frame.executionPath.at(-1);
  const branch = node.branches.find((candidate) => candidate.id === branchId);
  if (!branch || !frame.instanceId) throw new Error(`Parallel ${node.id} 无法从执行 frame 解析分支 identity。`);
  return {
    branchId: branch.id,
    label: branch.label,
    order: branch.order,
    instanceId: frame.instanceId,
    status: "succeeded",
    output: branchOutput(node, branch.id, frame),
    frame,
  };
}

/** 将 dispatcher frame 规范化为成功或 collect 失败分支结果。 */
export function normalizeParallelBranchResult(
  node: WorkflowIRParallelNode,
  frame: MastraWorkflowFrame,
): Exclude<MastraParallelBranchResult, { status: "skipped" }> {
  if (!frame.instanceFailure) return normalizeParallelBranchSuccess(node, frame);
  const branchId = frame.executionPath.at(-1);
  const branch = node.branches.find((candidate) => candidate.id === branchId);
  if (!branch || !frame.instanceId) throw new Error(`Parallel ${node.id} 无法从失败 frame 解析分支 identity。`);
  return {
    branchId: branch.id,
    label: branch.label,
    order: branch.order,
    instanceId: frame.instanceId,
    status: "failed",
    error: {
      code: frame.instanceFailure.code,
      message: frame.instanceFailure.message,
    },
    frame,
  };
}

function createMastraParallelBranchResultStep(node: WorkflowIRParallelNode) {
  return createStep({
    id: `${node.id}-branch-result`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_PARALLEL_BRANCH_RESULT_SCHEMA,
    execute: async ({ inputData }) => normalizeParallelBranchResult(node, inputData),
  });
}

/** 计算 Parallel 单次运行的有效并发，平台硬上限固定为 10。 */
export function resolveParallelConcurrency(
  node: WorkflowIRParallelNode,
  resourceBudgetMaxParallelism: number,
): number {
  return Math.max(1, Math.min(
    Math.trunc(node.config.maxConcurrency),
    Math.trunc(resourceBudgetMaxParallelism),
    10,
  ));
}

/** 使用 Mastra 原生 foreach 受限执行静态 dispatcher。 */
export function createMastraParallelForeachWorkflow(
  node: WorkflowIRParallelNode,
  dispatcher: AnyWorkflow,
  resourceBudgetMaxParallelism: number,
): AnyWorkflow {
  const workflowId = `${node.id}-bounded-foreach`;
  return (createWorkflow({
    id: workflowId,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_PARALLEL_BRANCH_RESULTS_SCHEMA,
  }) as AnyWorkflow)
    .then(createMastraParallelPrepareStep(node) as never)
    .foreach(dispatcher as never, {
      concurrency: () => resolveParallelConcurrency(node, resourceBudgetMaxParallelism),
    })
    .commit();
}

function resultSummary(result: MastraParallelBranchResult) {
  if (result.status === "succeeded") return { branchId: result.branchId, status: result.status, output: result.output };
  if (result.status === "failed") return { branchId: result.branchId, status: result.status, error: result.error };
  return { branchId: result.branchId, status: result.status };
}

/** 按 IR branch order 将分支结果确定性写入 Merge 节点输出。 */
export function mergeParallelBranchResults(
  node: WorkflowIRParallelNode,
  parentFrame: MastraWorkflowFrame,
  results: MastraParallelBranchResult[],
): MastraWorkflowFrame {
  const byBranch = new Map<string, MastraParallelBranchResult>();
  for (const result of results) {
    if (!node.branches.some((branch) => branch.id === result.branchId)) throw new Error(`Parallel ${node.id} 收到未知分支结果 ${result.branchId}。`);
    if (byBranch.has(result.branchId)) throw new Error(`Parallel ${node.id} 收到重复分支结果 ${result.branchId}。`);
    byBranch.set(result.branchId, result);
  }
  const ordered = [...node.branches]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((branch): MastraParallelBranchResult => {
      const result = byBranch.get(branch.id);
      if (result) return result;
      if (!node.merge.allowMissing) throw new Error(`Parallel ${node.id} 缺少分支结果 ${branch.id}。`);
      return { branchId: branch.id, label: branch.label, order: branch.order, status: "skipped" };
    });
  const failed = ordered.find((result) => result.status === "failed");
  if (failed?.status === "failed" && node.config.failurePolicy === "fail-fast") {
    throw Object.assign(new Error(failed.error.message), { code: failed.error.code, branchId: failed.branchId });
  }
  const nodeOutputs = { ...parentFrame.nodeOutputs };
  const selectedPorts = { ...parentFrame.selectedPorts };
  const skippedNodeIds = new Set(parentFrame.skippedNodeIds);
  for (const result of ordered) {
    if (result.status !== "succeeded") continue;
    Object.assign(nodeOutputs, result.frame.nodeOutputs);
    Object.assign(selectedPorts, result.frame.selectedPorts);
    for (const nodeId of result.frame.skippedNodeIds) skippedNodeIds.add(nodeId);
  }
  const summaries = ordered.map(resultSummary);
  const aggregation = node.merge.strategy === "ordered"
    ? summaries
    : Object.fromEntries(summaries.map(({ branchId, ...summary }) => [branchId, summary]));
  return {
    ...parentFrame,
    nodeOutputs: {
      ...nodeOutputs,
      [node.id]: { branches: summaries },
      [node.merge.nodeId]: { result: aggregation },
    },
    selectedPorts: {
      ...selectedPorts,
      [node.id]: node.branches.map((branch) => branch.id),
      [node.merge.nodeId]: [],
    },
    skippedNodeIds: [...skippedNodeIds],
  };
}

/** 创建将 parent frame 与 foreach results 收敛为单 frame 的 Mastra merge step。 */
export function createMastraParallelMergeStep(node: WorkflowIRParallelNode) {
  return createStep({
    id: `${node.id}-merge-results`,
    inputSchema: MASTRA_PARALLEL_MERGE_INPUT_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => mergeParallelBranchResults(node, inputData.frame, inputData.results),
  });
}

/** 从父 Workflow initData 恢复父 frame，并收敛 foreach branch results。 */
export function createMastraParallelMergeFromInitialStep(node: WorkflowIRParallelNode) {
  return createStep({
    id: `${node.id}-merge-from-initial`,
    inputSchema: MASTRA_PARALLEL_BRANCH_RESULTS_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData, getInitData }) => mergeParallelBranchResults(
      node,
      MASTRA_WORKFLOW_FRAME_SCHEMA.parse(getInitData()),
      inputData,
    ),
  });
}

/** 创建完整 Parallel prepare + dispatcher foreach + Merge 原生 Mastra Workflow。 */
export function createMastraParallelContainerWorkflow(
  node: WorkflowIRParallelNode,
  branchFrameWorkflows: ReadonlyMap<string, AnyWorkflow>,
  maxParallelism: number,
): AnyWorkflow {
  const branchWorkflows = new Map([...branchFrameWorkflows].map(([branchId, workflow]) => [
    branchId,
    createMastraParallelBranchWorkflow(node, branchId, workflow),
  ]));
  const dispatcher = createMastraParallelDispatcherWorkflow(node, branchWorkflows);
  const foreach = createMastraParallelForeachWorkflow(node, dispatcher, maxParallelism);
  return (createWorkflow({
    id: `${node.id}-container`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }) as AnyWorkflow)
    .then(foreach as never)
    .then(createMastraParallelMergeFromInitialStep(node) as never)
    .commit();
}
