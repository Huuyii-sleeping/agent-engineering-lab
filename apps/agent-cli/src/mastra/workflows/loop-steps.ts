import { createHash } from "node:crypto";
import { Script, createContext } from "node:vm";
import { createStep, createWorkflow, type AnyWorkflow } from "@mastra/core/workflows";
import type { WorkflowIRLoopNode } from "@orbit/workflow-core";
import {
  MASTRA_WORKFLOW_FRAME_SCHEMA,
  createMastraBranchMergeStep,
  createMastraBranchPassStep,
  createMastraWorkflowVariableContext,
  type MastraWorkflowFrame,
  withMastraWorkflowExecutionIdentity,
} from "./frame.js";

type LoopLimits = {
  maxIterations: number;
  maxRuntimeMs: number;
};

function loopInstanceId(productRunId: string, containerId: string): string {
  const digest = createHash("sha256")
    .update(productRunId)
    .update("\0")
    .update(containerId)
    .digest("hex")
    .slice(0, 24);
  return `loop-${digest}`;
}

/** 初始化 Loop 的稳定实例 identity、输入、变量、计数和开始时间。 */
export async function prepareLoopFrame(
  node: WorkflowIRLoopNode,
  parentFrame: MastraWorkflowFrame,
  startedAt = Date.now(),
): Promise<MastraWorkflowFrame> {
  const context = createMastraWorkflowVariableContext(parentFrame);
  const inputs = Object.fromEntries(await Promise.all(node.config.inputBindings.map(async (binding) => (
    [binding.inputId, await context.resolveValue(binding.value)]
  ))));
  const variables = Object.fromEntries(await Promise.all(node.config.initialVariables.map(async (variable) => (
    [variable.id, await context.resolveValue(variable.value)]
  ))));
  const instanceId = loopInstanceId(parentFrame.productRunId, node.id);
  return withMastraWorkflowExecutionIdentity({
    ...parentFrame,
    containerContexts: {
      ...parentFrame.containerContexts,
      [node.id]: {
        inputs,
        iteration: 0,
        startedAt,
        variables,
        previousOutputs: {},
      },
    },
  }, {
    containerId: node.id,
    instanceId,
    executionPath: [...parentFrame.executionPath, node.id],
  });
}

/** 解析本次 Loop body 的声明输出；无声明时保留终端节点结果。 */
export async function collectLoopBodyOutputs(
  node: WorkflowIRLoopNode,
  frame: MastraWorkflowFrame,
): Promise<Record<string, unknown>> {
  if (node.config.body.outputs.length > 0) {
    const context = createMastraWorkflowVariableContext(frame);
    return Object.fromEntries(await Promise.all(node.config.body.outputs.map(async (output) => (
      [output.id, await context.resolve(output.value)]
    ))));
  }
  const terminalIds = node.body.topology.terminalNodeIds;
  if (terminalIds.length === 1) return frame.nodeOutputs[terminalIds[0]!] ?? frame.output ?? {};
  if (terminalIds.length > 1) return Object.fromEntries(terminalIds.map((nodeId) => [nodeId, frame.nodeOutputs[nodeId]]));
  return frame.output ?? {};
}

/** 完成一次 body 后递增计数、保存 previous outputs，并按同名输出更新 loop variables。 */
export async function advanceLoopFrame(
  node: WorkflowIRLoopNode,
  frame: MastraWorkflowFrame,
): Promise<MastraWorkflowFrame> {
  const current = frame.containerContexts[node.id];
  if (!current || current.iteration === undefined || current.startedAt === undefined) {
    throw new Error(`Loop ${node.id} 缺少已初始化的容器上下文。`);
  }
  const outputs = await collectLoopBodyOutputs(node, frame);
  const variables = { ...current.variables };
  for (const variable of node.config.initialVariables) {
    if (Object.prototype.hasOwnProperty.call(outputs, variable.id)) variables[variable.id] = outputs[variable.id];
  }
  return {
    ...frame,
    containerContexts: {
      ...frame.containerContexts,
      [node.id]: {
        ...current,
        iteration: current.iteration + 1,
        variables,
        previousOutputs: outputs,
      },
    },
  };
}

/** 将 Loop 最终声明输出写回父 frame，并恢复父级执行 identity。 */
export function mergeLoopFrame(
  node: WorkflowIRLoopNode,
  parentFrame: MastraWorkflowFrame,
  loopFrame: MastraWorkflowFrame,
): MastraWorkflowFrame {
  const outputs = loopFrame.containerContexts[node.id]?.previousOutputs ?? {};
  const nodeOutput = node.config.body.outputs.length > 0
    ? Object.fromEntries(node.config.body.outputs.map((output) => [`output:${output.id}`, outputs[output.id]]))
    : { result: outputs };
  return {
    ...parentFrame,
    nodeOutputs: { ...parentFrame.nodeOutputs, ...loopFrame.nodeOutputs, [node.id]: nodeOutput },
    selectedPorts: { ...parentFrame.selectedPorts, ...loopFrame.selectedPorts, [node.id]: [] },
    skippedNodeIds: [...new Set([...parentFrame.skippedNodeIds, ...loopFrame.skippedNodeIds])],
  };
}

/** 在受限 VM context 中求值 Loop 业务条件。 */
export function evaluateLoopBusinessCondition(node: WorkflowIRLoopNode, frame: MastraWorkflowFrame): boolean {
  const loop = frame.containerContexts[node.id];
  if (!loop || loop.iteration === undefined) throw new Error(`Loop ${node.id} 缺少已初始化的容器上下文。`);
  const context = createContext({
    input: loop.inputs,
    iteration: loop.iteration,
    variables: loop.variables ?? {},
    previousOutput: loop.previousOutputs ?? {},
    ...loop.inputs,
    ...(loop.variables ?? {}),
  }, { codeGeneration: { strings: false, wasm: false } });
  return Boolean(new Script(`Boolean(${node.config.condition})`).runInContext(context, { timeout: 50 }));
}

/** 返回阻止下一次迭代的硬限制；undefined 表示仍有预算。 */
export function loopLimitReason(
  node: WorkflowIRLoopNode,
  frame: MastraWorkflowFrame,
  limits: LoopLimits,
  now = Date.now(),
): "iterations" | "timeout" | undefined {
  const loop = frame.containerContexts[node.id];
  if (!loop || loop.iteration === undefined || loop.startedAt === undefined) {
    throw new Error(`Loop ${node.id} 缺少已初始化的容器上下文。`);
  }
  const maxIterations = Math.max(1, Math.min(node.config.maxIterations, limits.maxIterations, 1_000));
  if (loop.iteration >= maxIterations) return "iterations";
  const timeoutMs = Math.max(1, Math.min(node.config.timeoutMs, limits.maxRuntimeMs));
  if (now - loop.startedAt >= timeoutMs) return "timeout";
  return undefined;
}

function businessRequestsAnotherIteration(node: WorkflowIRLoopNode, frame: MastraWorkflowFrame): boolean {
  const condition = evaluateLoopBusinessCondition(node, frame);
  return node.config.mode === "while" ? condition : !condition;
}

/** Loop 硬限制先于业务终止时抛出稳定结构化错误。 */
export function assertLoopCompleted(
  node: WorkflowIRLoopNode,
  frame: MastraWorkflowFrame,
  limits: LoopLimits,
  now = Date.now(),
): MastraWorkflowFrame {
  const reason = loopLimitReason(node, frame, limits, now);
  if (reason && businessRequestsAnotherIteration(node, frame)) {
    throw Object.assign(new Error(
      reason === "iterations"
        ? `Loop ${node.id} 达到最大迭代次数。`
        : `Loop ${node.id} 达到最大运行时长。`,
    ), { code: "WORKFLOW_LOOP_LIMIT_EXCEEDED", reason });
  }
  return frame;
}

function createMastraLoopPrepareStep(node: WorkflowIRLoopNode) {
  return createStep({
    id: `${node.id}-prepare`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => prepareLoopFrame(node, inputData),
  });
}

function createMastraLoopAdvanceStep(node: WorkflowIRLoopNode) {
  return createStep({
    id: `${node.id}-advance`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => advanceLoopFrame(node, inputData),
  });
}

function createMastraLoopGuardStep(node: WorkflowIRLoopNode, limits: LoopLimits) {
  return createStep({
    id: `${node.id}-guard`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => assertLoopCompleted(node, inputData, limits),
  });
}

function createMastraLoopMergeFromInitialStep(node: WorkflowIRLoopNode) {
  return createStep({
    id: `${node.id}-merge-from-initial`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData, getInitData }) => mergeLoopFrame(
      node,
      MASTRA_WORKFLOW_FRAME_SCHEMA.parse(getInitData()),
      inputData,
    ),
  });
}

/** 使用 Mastra 原生 branch + dowhile/dountil 创建零次守卫和受限 Loop。 */
export function createMastraLoopContainerWorkflow(
  node: WorkflowIRLoopNode,
  bodyFrameWorkflow: AnyWorkflow,
  limits: LoopLimits,
): AnyWorkflow {
  const cycle = (createWorkflow({
    id: `${node.id}-cycle`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }) as AnyWorkflow)
    .then(bodyFrameWorkflow as never)
    .then(createMastraLoopAdvanceStep(node) as never)
    .commit();
  let nativeLoop = createWorkflow({
    id: `${node.id}-native-loop`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }) as AnyWorkflow;
  nativeLoop = node.config.mode === "while"
    ? nativeLoop.dowhile(cycle as never, async ({ inputData, abortSignal }) => (
      !abortSignal.aborted
      && loopLimitReason(node, inputData, limits) === undefined
      && evaluateLoopBusinessCondition(node, inputData)
    )) as AnyWorkflow
    : nativeLoop.dountil(cycle as never, async ({ inputData, abortSignal }) => (
      abortSignal.aborted
      || loopLimitReason(node, inputData, limits) !== undefined
      || evaluateLoopBusinessCondition(node, inputData)
    )) as AnyWorkflow;
  const committedLoop = nativeLoop.commit();
  const zeroPass = createMastraBranchPassStep(`${node.id}-zero-pass`);
  const prepared = (createWorkflow({
    id: `${node.id}-container`,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
  }) as AnyWorkflow)
    .then(createMastraLoopPrepareStep(node) as never)
    .branch([
      [async ({ inputData, abortSignal }: { inputData: MastraWorkflowFrame; abortSignal: AbortSignal }) => (
        !abortSignal.aborted
        && loopLimitReason(node, inputData, limits) === undefined
        && businessRequestsAnotherIteration(node, inputData)
      ), committedLoop],
      [async () => true, zeroPass],
    ] as never)
    .then(createMastraBranchMergeStep(`${node.id}-entry-merge`, [committedLoop.id, zeroPass.id]) as never)
    .then(createMastraLoopGuardStep(node, limits) as never)
    .then(createMastraLoopMergeFromInitialStep(node) as never)
    .commit();
  return prepared;
}
