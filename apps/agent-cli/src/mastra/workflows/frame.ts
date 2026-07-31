import type {
  WorkflowExecutionEventIdentity,
  WorkflowIR,
  WorkflowIRNode,
} from "@orbit/workflow-core";
import { z } from "zod";
import { createStep, type OutputWriter, type Step } from "@mastra/core/workflows";
import { assertWorkflowValueType, WorkflowVariableContext } from "../../workflows/context.js";
import type {
  WorkflowExecutorRegistry,
  WorkflowExecutorResult,
} from "../../workflows/executor-registry.js";

/** 容器、实例和子运行使用的框架无关执行身份。 */
export type WorkflowExecutionIdentity = {
  containerId?: string;
  instanceId?: string;
  iterationIndex?: number;
  executionPath: string[];
  childRunId?: string;
};

/** Iteration/Loop 子图读取的显式容器运行上下文。 */
export type MastraWorkflowContainerContext = {
  inputs: Record<string, unknown>;
  item?: unknown;
  index?: number;
  iteration?: number;
  startedAt?: number;
  variables?: Record<string, unknown>;
  previousOutputs?: Record<string, unknown>;
};

/** collect/continue 策略在原生 Workflow 内传播的结构化实例失败。 */
export type MastraWorkflowInstanceFailure = {
  code: string;
  message: string;
  nodeId: string;
};

/** Orbit Workflow 数据在 Mastra typed steps 之间传递的稳定 frame。 */
export type MastraWorkflowFrame = WorkflowExecutionIdentity & {
  productRunId: string;
  nativeRunId?: string;
  workflowVersionId?: string;
  workflowInputs: Record<string, unknown>;
  nodeInputs?: Record<string, unknown>;
  targetNodeId?: string;
  requestContext: Record<string, unknown>;
  containerContexts: Record<string, MastraWorkflowContainerContext>;
  instanceFailure?: MastraWorkflowInstanceFailure;
  nodeOutputs: Record<string, Record<string, unknown>>;
  nodeEventIdentities: Record<string, WorkflowExecutionEventIdentity>;
  selectedPorts: Record<string, string[]>;
  skippedNodeIds: string[];
  output?: Record<string, unknown>;
};

export const MASTRA_WORKFLOW_FRAME_SCHEMA = z.object({
  productRunId: z.string(),
  nativeRunId: z.string().optional(),
  workflowVersionId: z.string().optional(),
  workflowInputs: z.record(z.unknown()),
  nodeInputs: z.record(z.unknown()).optional(),
  targetNodeId: z.string().optional(),
  requestContext: z.record(z.unknown()),
  containerContexts: z.record(z.object({
    inputs: z.record(z.unknown()),
    item: z.unknown().optional(),
    index: z.number().int().nonnegative().optional(),
    iteration: z.number().int().nonnegative().optional(),
    startedAt: z.number().int().nonnegative().optional(),
    variables: z.record(z.unknown()).optional(),
    previousOutputs: z.record(z.unknown()).optional(),
  })),
  instanceFailure: z.object({
    code: z.string(),
    message: z.string(),
    nodeId: z.string(),
  }).optional(),
  nodeEventIdentities: z.record(z.object({
    containerId: z.string().optional(),
    instanceId: z.string().optional(),
    iterationIndex: z.number().int().nonnegative().optional(),
    executionPath: z.array(z.string()).optional(),
    childRunId: z.string().optional(),
  })),
  containerId: z.string().optional(),
  instanceId: z.string().optional(),
  iterationIndex: z.number().int().nonnegative().optional(),
  executionPath: z.array(z.string()),
  childRunId: z.string().optional(),
  nodeOutputs: z.record(z.record(z.unknown())),
  selectedPorts: z.record(z.array(z.string())),
  skippedNodeIds: z.array(z.string()),
  output: z.record(z.unknown()).optional(),
});

/** typed step 通过 Mastra outputWriter 发送给 Adapter 的内部产品事件。 */
export type OrbitWorkflowNodeOutputEvent = {
  type: "orbit-workflow-node-event";
  payload: WorkflowExecutionEventIdentity & {
    kind: "delta" | "log";
    nodeId: string;
    delta?: string;
    level?: "debug" | "info" | "warning" | "error";
    message?: string;
  };
};

/** 创建一次 Mastra Workflow 执行的初始 frame。 */
export function createMastraWorkflowFrame(input: {
  productRunId: string;
  nativeRunId?: string;
  workflowVersionId?: string;
  workflowInputs?: Record<string, unknown>;
  nodeInputs?: Record<string, unknown>;
  targetNodeId?: string;
  requestContext?: Record<string, unknown>;
  containerContexts?: Record<string, MastraWorkflowContainerContext>;
  containerId?: string;
  instanceId?: string;
  iterationIndex?: number;
  executionPath?: string[];
  childRunId?: string;
}): MastraWorkflowFrame {
  return {
    productRunId: input.productRunId,
    ...(input.nativeRunId === undefined ? {} : { nativeRunId: input.nativeRunId }),
    ...(input.workflowVersionId === undefined ? {} : { workflowVersionId: input.workflowVersionId }),
    workflowInputs: input.workflowInputs ?? {},
    nodeInputs: input.nodeInputs,
    targetNodeId: input.targetNodeId,
    requestContext: input.requestContext ?? {},
    containerContexts: structuredClone(input.containerContexts ?? {}),
    ...(input.containerId === undefined ? {} : { containerId: input.containerId }),
    ...(input.instanceId === undefined ? {} : { instanceId: input.instanceId }),
    ...(input.iterationIndex === undefined ? {} : { iterationIndex: input.iterationIndex }),
    executionPath: [...(input.executionPath ?? [])],
    ...(input.childRunId === undefined ? {} : { childRunId: input.childRunId }),
    nodeOutputs: {},
    nodeEventIdentities: {},
    selectedPorts: {},
    skippedNodeIds: [],
  };
}

/** 在不修改父 frame 的前提下派生容器实例或子运行身份。 */
export function withMastraWorkflowExecutionIdentity(
  frame: MastraWorkflowFrame,
  identity: WorkflowExecutionIdentity,
): MastraWorkflowFrame {
  return {
    ...frame,
    ...identity,
    executionPath: [...identity.executionPath],
  };
}

function assignInput(target: Record<string, unknown>, portId: string, value: unknown): void {
  const current = target[portId];
  target[portId] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  if (portId === "in" && value && typeof value === "object" && !Array.isArray(value)) {
    Object.assign(target, value);
  }
}

function collectInputs(frame: MastraWorkflowFrame, node: WorkflowIRNode, ir: WorkflowIR): Record<string, unknown> {
  if (frame.targetNodeId === node.id) return { ...(frame.nodeInputs ?? {}) };
  const inputs: Record<string, unknown> = {};
  for (const edge of ir.edges.filter((candidate) => candidate.targetNodeId === node.id)) {
    const selected = frame.selectedPorts[edge.sourceNodeId];
    if (selected && selected.length > 0 && !selected.includes(edge.sourcePortId)) continue;
    const sourceOutput = frame.nodeOutputs[edge.sourceNodeId];
    if (!sourceOutput) continue;
    const value = sourceOutput[edge.sourcePortId] ?? sourceOutput.value ?? sourceOutput;
    assignInput(inputs, edge.targetPortId, value);
  }
  if (node.type === "start") Object.assign(inputs, frame.workflowInputs);
  return inputs;
}

/** 从 frame 创建节点和容器共用的产品变量上下文。 */
export function createMastraWorkflowVariableContext(frame: MastraWorkflowFrame): WorkflowVariableContext {
  const context = new WorkflowVariableContext({
    inputs: frame.workflowInputs,
    system: {
      runId: frame.productRunId,
      currentTime: new Date().toISOString(),
      requestContext: frame.requestContext,
    },
    containers: frame.containerContexts,
  });
  for (const [nodeId, output] of Object.entries(frame.nodeOutputs)) context.setNodeOutput(nodeId, output);
  return context;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Workflow 节点已取消。"));
    }, { once: true });
  });
}

async function executeWithTimeout(
  action: (signal: AbortSignal) => Promise<WorkflowExecutorResult>,
  timeoutMs: number,
  parentSignal: AbortSignal,
): Promise<WorkflowExecutorResult> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(controller.signal),
      new Promise<WorkflowExecutorResult>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error(`节点执行超过 ${timeoutMs}ms。`), { code: "WORKFLOW_NODE_TIMEOUT" }));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal.removeEventListener("abort", onAbort);
  }
}

async function executeNode(
  frame: MastraWorkflowFrame,
  node: WorkflowIRNode,
  ir: WorkflowIR,
  executors: WorkflowExecutorRegistry,
  signal: AbortSignal,
  resumeData?: unknown,
  suspend?: (payload?: unknown, options?: { resumeLabel?: string }) => unknown,
  captureUnhandledFailure = false,
  outputWriter?: OutputWriter,
): Promise<MastraWorkflowFrame | unknown> {
  if (frame.instanceFailure) return frame;
  if (frame.targetNodeId && frame.targetNodeId !== node.id) return frame;
  if (node.disabled) {
    return { ...frame, skippedNodeIds: [...new Set([...frame.skippedNodeIds, node.id])] };
  }
  const executor = executors.require(node.executor);
  const inputs = collectInputs(frame, node, ir);
  const maxAttempts = node.execution.idempotent ? node.execution.maxAttempts : 1;
  const baseIdentity: WorkflowExecutionEventIdentity = {
    ...(frame.containerId === undefined ? {} : { containerId: frame.containerId }),
    ...(frame.instanceId === undefined ? {} : { instanceId: frame.instanceId }),
    ...(frame.iterationIndex === undefined ? {} : { iterationIndex: frame.iterationIndex }),
    executionPath: frame.executionPath.at(-1) === node.id
      ? [...frame.executionPath]
      : [...frame.executionPath, node.id],
    ...(frame.childRunId === undefined ? {} : { childRunId: frame.childRunId }),
  };
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let outputFailure: unknown;
    let pendingOutput = Promise.resolve();
    const emit = (payload: OrbitWorkflowNodeOutputEvent["payload"]): void => {
      if (!outputWriter) return;
      pendingOutput = pendingOutput
        .then(() => outputWriter({ type: "orbit-workflow-node-event", payload } satisfies OrbitWorkflowNodeOutputEvent))
        .catch((error) => { outputFailure = error; });
    };
    const flushOutput = async (): Promise<void> => {
      await pendingOutput;
      if (outputFailure) throw outputFailure;
    };
    try {
      const result = await executeWithTimeout((nodeSignal) => executor.execute({
        runId: frame.productRunId,
        nativeRunId: frame.nativeRunId,
        workflowId: ir.source.workflowId,
        workflowVersionId: ir.source.kind === "version" ? ir.source.versionId : frame.workflowVersionId,
        node,
        nodeInstanceId: frame.instanceId
          ? `${frame.instanceId}:${node.id}:${frame.containerId ? frame.containerContexts[frame.containerId]?.iteration ?? "" : ""}`
          : node.id,
        attempt,
        inputs,
        requestContext: frame.requestContext,
        resumeData,
        variables: createMastraWorkflowVariableContext(frame),
        signal: nodeSignal,
        executionIdentity: baseIdentity,
        emitLog: (level, message, identity = {}) => emit({
          ...baseIdentity,
          ...identity,
          kind: "log",
          nodeId: node.id,
          level,
          message,
        }),
        emitDelta: (delta, identity = {}) => emit({
          ...baseIdentity,
          ...identity,
          kind: "delta",
          nodeId: node.id,
          delta,
        }),
      }), node.execution.timeoutMs, signal);
      await flushOutput();
      if (result.suspend) {
        if (!suspend) throw new Error(`节点 ${node.id} 请求暂停，但 Mastra suspend 不可用。`);
        return suspend(result.suspend.payload, { resumeLabel: node.id });
      }
      for (const port of node.ports.outputs) {
        if (result.outputs[port.id] !== undefined) {
          assertWorkflowValueType(`${node.id}.${port.id}`, port.dataType, result.outputs[port.id]);
        }
      }
      return {
        ...frame,
        nodeOutputs: { ...frame.nodeOutputs, [node.id]: result.outputs },
        nodeEventIdentities: {
          ...frame.nodeEventIdentities,
          [node.id]: result.eventIdentity ?? baseIdentity,
        },
        selectedPorts: { ...frame.selectedPorts, [node.id]: result.selectedPortIds ?? [] },
        output: node.type === "end" ? result.outputs : frame.output,
      };
    } catch (caughtError) {
      let executionError = caughtError;
      try {
        await flushOutput();
      } catch (outputError) {
        executionError = outputError;
      }
      if (signal.aborted) throw executionError;
      lastError = executionError;
      if (attempt < maxAttempts) await delay(node.execution.retryBackoffMs, signal);
    }
  }
  if (node.execution.onError === "default") {
    const outputs = node.execution.defaultOutput ?? {};
    return {
      ...frame,
      nodeOutputs: { ...frame.nodeOutputs, [node.id]: outputs },
      nodeEventIdentities: { ...frame.nodeEventIdentities, [node.id]: baseIdentity },
      selectedPorts: { ...frame.selectedPorts, [node.id]: [] },
    };
  }
  if (node.execution.onError === "route" && node.execution.errorPortId) {
    const error = lastError instanceof Error ? lastError.message : String(lastError);
    return {
      ...frame,
      nodeOutputs: { ...frame.nodeOutputs, [node.id]: { error } },
      nodeEventIdentities: { ...frame.nodeEventIdentities, [node.id]: baseIdentity },
      selectedPorts: { ...frame.selectedPorts, [node.id]: [node.execution.errorPortId] },
    };
  }
  if (captureUnhandledFailure) {
    const value = lastError && typeof lastError === "object" ? lastError as Record<string, unknown> : {};
    return {
      ...frame,
      instanceFailure: {
        code: typeof value.code === "string" ? value.code : "WORKFLOW_NODE_EXECUTION_FAILED",
        message: lastError instanceof Error ? lastError.message : String(lastError ?? "Workflow 节点执行失败。"),
        nodeId: node.id,
      },
    };
  }
  throw lastError;
}

/** 将单个 Orbit IR node 映射为 Mastra typed step。 */
export function createMastraWorkflowNodeStep(
  ir: WorkflowIR,
  node: WorkflowIRNode,
  executors: WorkflowExecutorRegistry,
  options: { captureUnhandledFailure?: boolean } = {},
): Step<string, unknown, MastraWorkflowFrame, MastraWorkflowFrame, unknown, unknown> {
  return createStep({
    id: node.id,
    description: node.label,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData, abortSignal, resumeData, suspend, outputWriter }) => (
      executeNode(
        inputData,
        node,
        ir,
        executors,
        abortSignal,
        resumeData,
        suspend,
        options.captureUnhandledFailure === true,
        outputWriter,
      ) as Promise<MastraWorkflowFrame>
    ),
  });
}

/** 将 Mastra branch 的 keyed output 收敛回单一 Workflow frame。 */
export function createMastraBranchMergeStep(id: string, branchIds: string[]) {
  return createStep({
    id,
    inputSchema: z.object(Object.fromEntries(
      branchIds.map((branchId) => [branchId, MASTRA_WORKFLOW_FRAME_SCHEMA.optional()]),
    )),
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => {
      const frame = Object.values(inputData).find((value) => value !== undefined);
      if (!frame) throw new Error(`Mastra branch ${id} 没有返回活动分支。`);
      return frame;
    },
  });
}

/** 为直接汇入公共后继节点的分支创建无副作用 pass-through step。 */
export function createMastraBranchPassStep(id: string) {
  return createStep({
    id,
    inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    execute: async ({ inputData }) => inputData,
  });
}
