import { createHash } from "node:crypto";
import type { WorkflowIRSubworkflowNode } from "@orbit/workflow-core";
import { createStep, createWorkflow, type AnyWorkflow } from "@mastra/core/workflows";
import { assertWorkflowValueType } from "../../workflows/context.js";
import {
  MASTRA_WORKFLOW_FRAME_SCHEMA,
  createMastraWorkflowFrame,
  createMastraWorkflowVariableContext,
  type MastraWorkflowFrame,
} from "./frame.js";

function stableId(prefix: string, parts: readonly string[]): string {
  const digest = createHash("sha256")
    .update(parts.join("\0"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}-${digest}`;
}

function parentNodeInstanceId(node: WorkflowIRSubworkflowNode, frame: MastraWorkflowFrame): string {
  const containerCoordinates = Object.entries(frame.containerContexts)
    .map(([containerId, context]) => [
      containerId,
      context.index === undefined ? "" : String(context.index),
      context.iteration === undefined ? "" : String(context.iteration),
    ].join(":"))
    .sort();
  return stableId("subworkflow-node", [
    frame.productRunId,
    frame.executionPath.join("/"),
    frame.instanceId ?? "",
    node.id,
    ...containerCoordinates,
  ]);
}

/** 由父 run、父节点实例和固定子版本派生稳定逻辑 child run identity。 */
export function deriveSubworkflowChildRunId(
  parentRunId: string,
  parentNodeInstanceId: string,
  childVersionId: string,
): string {
  return stableId("workflow-child", [parentRunId, parentNodeInstanceId, childVersionId]);
}

/** 解析显式输入绑定并创建与父节点输出隔离的固定版本子流程 frame。 */
export async function prepareSubworkflowFrame(
  node: WorkflowIRSubworkflowNode,
  parentFrame: MastraWorkflowFrame,
): Promise<MastraWorkflowFrame> {
  const variables = createMastraWorkflowVariableContext(parentFrame);
  const workflowInputs = Object.fromEntries(await Promise.all(node.config.inputBindings.map(async (binding) => (
    [binding.inputId, await variables.resolveValue(binding.value)]
  ))));
  const instanceId = parentNodeInstanceId(node, parentFrame);
  return createMastraWorkflowFrame({
    productRunId: parentFrame.productRunId,
    workflowInputs,
    requestContext: parentFrame.requestContext,
    containerId: node.id,
    instanceId,
    executionPath: [...parentFrame.executionPath, node.id],
    childRunId: deriveSubworkflowChildRunId(
      parentFrame.productRunId,
      instanceId,
      node.dependency.versionId,
    ),
  });
}

function childWorkflowOutput(
  node: WorkflowIRSubworkflowNode,
  childFrame: MastraWorkflowFrame,
): Record<string, unknown> {
  if (childFrame.output) return childFrame.output;
  const terminalIds = node.workflow.topology.terminalNodeIds;
  if (terminalIds.length === 1) return childFrame.nodeOutputs[terminalIds[0]!] ?? {};
  return Object.fromEntries(terminalIds.map((nodeId) => [nodeId, childFrame.nodeOutputs[nodeId]]));
}

function subworkflowFailure(node: WorkflowIRSubworkflowNode, childFrame: MastraWorkflowFrame): Error | undefined {
  if (!childFrame.instanceFailure) return undefined;
  return Object.assign(new Error(childFrame.instanceFailure.message), {
    code: childFrame.instanceFailure.code,
    nodeId: node.id,
    details: {
      parentNodeId: node.id,
      childRunId: childFrame.childRunId,
      childVersionId: node.dependency.versionId,
      internalNodeId: childFrame.instanceFailure.nodeId,
      executionPath: [...childFrame.executionPath, childFrame.instanceFailure.nodeId],
    },
  });
}

/** 将子流程声明输出写回父 frame，并恢复父级 execution identity。 */
export function mergeSubworkflowFrame(
  node: WorkflowIRSubworkflowNode,
  parentFrame: MastraWorkflowFrame,
  childFrame: MastraWorkflowFrame,
): MastraWorkflowFrame {
  const failure = subworkflowFailure(node, childFrame);
  if (failure) throw failure;
  const childOutput = childWorkflowOutput(node, childFrame);
  const nodeOutput = node.config.outputBindings.length > 0
    ? Object.fromEntries(node.config.outputBindings.map((binding) => {
      const value = childOutput[binding.outputId];
      assertWorkflowValueType(`${node.id}.output:${binding.outputId}`, binding.dataType, value);
      return [`output:${binding.outputId}`, value];
    }))
    : { result: childOutput };
  return {
    ...parentFrame,
    nodeOutputs: { ...parentFrame.nodeOutputs, [node.id]: nodeOutput },
    selectedPorts: { ...parentFrame.selectedPorts, [node.id]: [] },
  };
}

function createMastraSubworkflowPrepareStep(node: WorkflowIRSubworkflowNode) {
  return createStep({
    id: `${node.id}-prepare`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => prepareSubworkflowFrame(node, inputData),
  });
}

function createMastraSubworkflowMergeStep(node: WorkflowIRSubworkflowNode) {
  return createStep({
    id: `${node.id}-merge-from-initial`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData, getInitData }) => mergeSubworkflowFrame(
      node,
      MASTRA_WORKFLOW_FRAME_SCHEMA.parse(getInitData()),
      inputData,
    ),
  });
}

/** 将固定版本子流程包装为父 Mastra Workflow 内的单个 nested Workflow step。 */
export function createMastraSubworkflowContainerWorkflow(
  node: WorkflowIRSubworkflowNode,
  childWorkflow: AnyWorkflow,
): AnyWorkflow {
  return (createWorkflow({
    id: `${node.id}-container`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }) as AnyWorkflow)
    .then(createMastraSubworkflowPrepareStep(node) as never)
    .then(childWorkflow as never)
    .then(createMastraSubworkflowMergeStep(node) as never)
    .commit();
}
