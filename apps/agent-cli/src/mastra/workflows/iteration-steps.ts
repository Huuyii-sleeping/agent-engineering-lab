import { createHash } from "node:crypto";
import type { WorkflowIRIterationNode } from "@orbit/workflow-core";
import { createStep, createWorkflow, type AnyWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  MASTRA_WORKFLOW_FRAME_SCHEMA,
  createMastraWorkflowVariableContext,
  type MastraWorkflowFrame,
  withMastraWorkflowExecutionIdentity,
} from "./frame.js";

export const MASTRA_ITERATION_DESCRIPTOR_SCHEMA = z.object({
  containerId: z.string(),
  instanceId: z.string(),
  index: z.number().int().nonnegative(),
  item: z.unknown(),
  frame: MASTRA_WORKFLOW_FRAME_SCHEMA,
});

export type MastraIterationDescriptor = z.infer<typeof MASTRA_ITERATION_DESCRIPTOR_SCHEMA>;

export const MASTRA_ITERATION_DESCRIPTORS_SCHEMA = z.array(MASTRA_ITERATION_DESCRIPTOR_SCHEMA);

const ITERATION_ERROR_SCHEMA = z.object({ code: z.string(), message: z.string() });

export const MASTRA_ITERATION_RESULT_SCHEMA = z.discriminatedUnion("status", [
  z.object({
    index: z.number().int().nonnegative(),
    instanceId: z.string(),
    status: z.literal("succeeded"),
    output: z.unknown().optional(),
    frame: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }),
  z.object({
    index: z.number().int().nonnegative(),
    instanceId: z.string(),
    status: z.literal("failed"),
    error: ITERATION_ERROR_SCHEMA,
    frame: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }),
]);

export type MastraIterationResult = z.infer<typeof MASTRA_ITERATION_RESULT_SCHEMA>;
export const MASTRA_ITERATION_RESULTS_SCHEMA = z.array(MASTRA_ITERATION_RESULT_SCHEMA);
export const MASTRA_ITERATION_MERGE_INPUT_SCHEMA = z.object({
  frame: MASTRA_WORKFLOW_FRAME_SCHEMA,
  results: MASTRA_ITERATION_RESULTS_SCHEMA,
});

function iterationInstanceId(productRunId: string, containerId: string, index: number): string {
  const digest = createHash("sha256")
    .update(productRunId)
    .update("\0")
    .update(containerId)
    .update("\0")
    .update(String(index))
    .digest("hex")
    .slice(0, 24);
  return `iteration-${digest}`;
}

function iterationError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** 在任何 body 实例启动前解析并校验 Iteration 输入。 */
export async function prepareIterationDescriptors(
  node: WorkflowIRIterationNode,
  frame: MastraWorkflowFrame,
  resourceBudgetMaxItems: number,
): Promise<MastraIterationDescriptor[]> {
  const variables = createMastraWorkflowVariableContext(frame);
  const value = await variables.resolveValue(node.config.items);
  if (!Array.isArray(value)) throw iterationError("WORKFLOW_ITERATION_INPUT_INVALID", `Iteration ${node.id} 输入必须是数组。`);
  const limit = Math.max(1, Math.min(Math.trunc(node.config.maxItems), Math.trunc(resourceBudgetMaxItems), 1_000));
  if (value.length > limit) throw iterationError("WORKFLOW_ITERATION_LIMIT_EXCEEDED", `Iteration ${node.id} 输入元素数 ${value.length} 超过上限 ${limit}。`);
  const containerInputs = Object.fromEntries(await Promise.all(node.config.inputBindings.map(async (binding) => (
    [binding.inputId, await variables.resolveValue(binding.value)]
  ))));
  return value.map((item, index) => {
    const instanceId = iterationInstanceId(frame.productRunId, node.id, index);
    const instanceFrame = {
      ...frame,
      containerContexts: {
        ...frame.containerContexts,
        [node.id]: { inputs: containerInputs, item, index },
      },
    };
    return {
      containerId: node.id,
      instanceId,
      index,
      item,
      frame: withMastraWorkflowExecutionIdentity(instanceFrame, {
        containerId: node.id,
        instanceId,
        iterationIndex: index,
        executionPath: [...frame.executionPath, node.id, String(index)],
      }),
    };
  });
}

/** 计算 Iteration 单次运行的有效并发，平台硬上限固定为 10。 */
export function resolveIterationConcurrency(node: WorkflowIRIterationNode, resourceBudgetMaxParallelism: number): number {
  return Math.max(1, Math.min(Math.trunc(node.config.maxConcurrency), Math.trunc(resourceBudgetMaxParallelism), 10));
}

/** 创建 Iteration prepare typed step。 */
export function createMastraIterationPrepareStep(node: WorkflowIRIterationNode, resourceBudgetMaxItems: number) {
  return createStep({
    id: `${node.id}-prepare`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_ITERATION_DESCRIPTORS_SCHEMA,
    execute: async ({ inputData }) => prepareIterationDescriptors(node, inputData, resourceBudgetMaxItems),
  });
}

/** 使用 Mastra 原生 foreach 受限执行统一 Iteration body Workflow。 */
export function createMastraIterationForeachWorkflow(
  node: WorkflowIRIterationNode,
  bodyWorkflow: AnyWorkflow,
  limits: { maxParallelism: number; maxItems: number },
): AnyWorkflow {
  return (createWorkflow({
    id: `${node.id}-bounded-foreach`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_ITERATION_RESULTS_SCHEMA,
  }) as AnyWorkflow)
    .then(createMastraIterationPrepareStep(node, limits.maxItems) as never)
    .foreach(bodyWorkflow as never, {
      concurrency: () => resolveIterationConcurrency(node, limits.maxParallelism),
    })
    .commit();
}

function createMastraIterationBodyFrameStep(node: WorkflowIRIterationNode) {
  return createStep({
    id: `${node.id}-body-frame`,
    inputSchema: MASTRA_ITERATION_DESCRIPTOR_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => inputData.frame,
  });
}

async function iterationOutput(node: WorkflowIRIterationNode, frame: MastraWorkflowFrame): Promise<unknown> {
  if (node.config.body.outputs.length > 0) {
    const variables = createMastraWorkflowVariableContext(frame);
    return Object.fromEntries(await Promise.all(node.config.body.outputs.map(async (output) => (
      [output.id, await variables.resolve(output.value)]
    ))));
  }
  const terminalIds = node.body.topology.terminalNodeIds;
  if (terminalIds.length === 1) return frame.nodeOutputs[terminalIds[0]!] ?? frame.output;
  if (terminalIds.length > 1) return Object.fromEntries(terminalIds.map((nodeId) => [nodeId, frame.nodeOutputs[nodeId]]));
  return frame.output;
}

function createMastraIterationResultStep(node: WorkflowIRIterationNode) {
  return createStep({
    id: `${node.id}-body-result`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_ITERATION_RESULT_SCHEMA,
    execute: async ({ inputData }) => {
      if (inputData.iterationIndex === undefined || !inputData.instanceId) {
        throw new Error(`Iteration ${node.id} body 缺少实例 identity。`);
      }
      if (inputData.instanceFailure) return {
        index: inputData.iterationIndex,
        instanceId: inputData.instanceId,
        status: "failed" as const,
        error: {
          code: inputData.instanceFailure.code,
          message: inputData.instanceFailure.message,
        },
        frame: inputData,
      };
      return {
        index: inputData.iterationIndex,
        instanceId: inputData.instanceId,
        status: "succeeded" as const,
        output: await iterationOutput(node, inputData),
        frame: inputData,
      };
    },
  });
}

/** 将已编译 frame Workflow 包装为 foreach 可消费的统一 Iteration body。 */
export function createMastraIterationBodyWorkflow(
  node: WorkflowIRIterationNode,
  bodyFrameWorkflow: AnyWorkflow,
): AnyWorkflow {
  return (createWorkflow({
    id: `${bodyFrameWorkflow.id}-${node.id}-iteration-body`,
    inputSchema: MASTRA_ITERATION_DESCRIPTOR_SCHEMA,
    outputSchema: MASTRA_ITERATION_RESULT_SCHEMA,
  }) as AnyWorkflow)
    .then(createMastraIterationBodyFrameStep(node) as never)
    .then(bodyFrameWorkflow as never)
    .then(createMastraIterationResultStep(node) as never)
    .commit();
}

function resultValue(result: MastraIterationResult, policy: WorkflowIRIterationNode["config"]["failurePolicy"]): unknown {
  if (policy === "collect-errors") {
    return result.status === "succeeded"
      ? { index: result.index, status: result.status, output: result.output }
      : { index: result.index, status: result.status, error: result.error };
  }
  return result.status === "succeeded" ? result.output : null;
}

/** 按 index 确定性聚合 Iteration 结果并恢复父 frame identity。 */
export function mergeIterationResults(
  node: WorkflowIRIterationNode,
  parentFrame: MastraWorkflowFrame,
  results: MastraIterationResult[],
): MastraWorkflowFrame {
  const ordered = [...results].sort((left, right) => left.index - right.index);
  const seen = new Set<number>();
  for (const result of ordered) {
    if (seen.has(result.index)) throw iterationError("WORKFLOW_ITERATION_RESULT_DUPLICATE", `Iteration ${node.id} 收到重复 index ${result.index}。`);
    seen.add(result.index);
  }
  const failed = ordered.find((result) => result.status === "failed");
  if (failed?.status === "failed" && node.config.failurePolicy === "fail-fast") {
    throw Object.assign(new Error(failed.error.message), { code: failed.error.code, iterationIndex: failed.index });
  }
  const values = ordered.map((result) => [result.index, resultValue(result, node.config.failurePolicy)] as const);
  const aggregation = node.config.aggregation === "ordered"
    ? values.map(([, value]) => value)
    : Object.fromEntries(values.map(([index, value]) => [String(index), value]));
  const nodeOutputs = { ...parentFrame.nodeOutputs };
  const selectedPorts = { ...parentFrame.selectedPorts };
  const skippedNodeIds = new Set(parentFrame.skippedNodeIds);
  for (const result of ordered) {
    if (result.status !== "succeeded") continue;
    Object.assign(nodeOutputs, result.frame.nodeOutputs);
    Object.assign(selectedPorts, result.frame.selectedPorts);
    for (const nodeId of result.frame.skippedNodeIds) skippedNodeIds.add(nodeId);
  }
  return {
    ...parentFrame,
    nodeOutputs: { ...nodeOutputs, [node.id]: { results: aggregation } },
    selectedPorts: { ...selectedPorts, [node.id]: [] },
    skippedNodeIds: [...skippedNodeIds],
  };
}

/** 创建将 parent frame 与 foreach item results 收敛为单 frame 的 Mastra step。 */
export function createMastraIterationMergeStep(node: WorkflowIRIterationNode) {
  return createStep({
    id: `${node.id}-merge-results`,
    inputSchema: MASTRA_ITERATION_MERGE_INPUT_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => mergeIterationResults(node, inputData.frame, inputData.results),
  });
}

/** 从父 Workflow initData 恢复父 frame，并收敛 foreach results。 */
export function createMastraIterationMergeFromInitialStep(node: WorkflowIRIterationNode) {
  return createStep({
    id: `${node.id}-merge-from-initial`,
    inputSchema: MASTRA_ITERATION_RESULTS_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData, getInitData }) => mergeIterationResults(
      node,
      MASTRA_WORKFLOW_FRAME_SCHEMA.parse(getInitData()),
      inputData,
    ),
  });
}

/** 创建完整 Iteration prepare + foreach body + merge 原生 Mastra Workflow。 */
export function createMastraIterationContainerWorkflow(
  node: WorkflowIRIterationNode,
  bodyFrameWorkflow: AnyWorkflow,
  limits: { maxParallelism: number; maxItems: number },
): AnyWorkflow {
  const body = createMastraIterationBodyWorkflow(node, bodyFrameWorkflow);
  const foreach = createMastraIterationForeachWorkflow(node, body, limits);
  return (createWorkflow({
    id: `${node.id}-container`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }) as AnyWorkflow)
    .then(foreach as never)
    .then(createMastraIterationMergeFromInitialStep(node) as never)
    .commit();
}
