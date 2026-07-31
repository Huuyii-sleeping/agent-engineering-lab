/** 工作流运行状态；终态不可逆。 */
export type WorkflowRunStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

/** 节点运行状态；ready 表示依赖已经满足。 */
export type WorkflowNodeRunStatus = "pending" | "ready" | "running" | "waiting" | "succeeded" | "failed" | "skipped" | "cancelled";

/** 工作流运行模式。 */
import type { ApprovalDisplayValue } from "./approval.js";
import type { WorkflowJsonSchema } from "./json-schema.js";
import type { WorkflowNode } from "./nodes.js";

export type WorkflowRunMode = "node-test" | "draft" | "production";

/** 运行或节点失败的结构化错误。 */
export type WorkflowRuntimeError = {
  code: string;
  message: string;
  nodeId?: string;
  attempt?: number;
  details?: Record<string, unknown>;
};

/** 跨 Agent、BFF 和 Web 共享的节点运行快照。 */
export type WorkflowNodeRunSnapshot = {
  nodeId: string;
  status: WorkflowNodeRunStatus;
  attempt: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: WorkflowRuntimeError;
  handledError?: boolean;
};

/** 容器内部节点实例的查询投影；key 由 nodeId + instanceId 稳定组成。 */
export type WorkflowNodeInstanceRunSnapshot = WorkflowNodeRunSnapshot & WorkflowExecutionEventIdentity & {
  instanceId: string;
};

/** Agent/Subworkflow 子运行的产品查询投影，不暴露 Mastra step 或 snapshot。 */
export type WorkflowChildRunSnapshot = WorkflowExecutionEventIdentity & {
  childRunId: string;
  parentNodeId: string;
  status: WorkflowNodeRunStatus;
  output?: Record<string, unknown>;
  error?: WorkflowRuntimeError;
};

/** 当前 waiting 原因及可选审批元数据。 */
export type WorkflowRunWaitingSnapshot = {
  nodeId: string;
  reason: string;
  waiting?: WorkflowWaitingMetadata;
};

/** 阶段 E 生产能力的稳定标识；它们是功能门禁，不是 Runtime backend selector。 */
export const WORKFLOW_STAGE_E_CAPABILITY_KEYS = [
  "parallelMerge",
  "iteration",
  "boundedLoop",
  "nestedWorkflow",
  "agentNode",
  "humanApproval",
  "restartResume",
] as const;

export type WorkflowStageECapability = typeof WORKFLOW_STAGE_E_CAPABILITY_KEYS[number];

/** 阶段 E 单项生产能力矩阵。 */
export type WorkflowStageECapabilityRegistry = Readonly<Record<WorkflowStageECapability, boolean>>;

/** 已通过独立门槛的生产默认矩阵；Parallel/Merge 因活动 sibling 取消缺口保持关闭。 */
export const DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES: WorkflowStageECapabilityRegistry = Object.freeze({
  parallelMerge: false,
  iteration: true,
  boundedLoop: true,
  nestedWorkflow: true,
  agentNode: true,
  humanApproval: true,
  restartResume: true,
});

/** 将局部配置补全为稳定的七项能力矩阵。 */
export function normalizeWorkflowStageECapabilities(
  value: Partial<WorkflowStageECapabilityRegistry> = {},
): WorkflowStageECapabilityRegistry {
  return Object.freeze({ ...DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES, ...value });
}

/** 返回某类节点生产运行所需的阶段 E 能力。 */
export function workflowStageECapabilitiesForNodeType(type: string): readonly WorkflowStageECapability[] {
  if (type === "parallel" || type === "merge") return ["parallelMerge"];
  if (type === "iteration") return ["iteration"];
  if (type === "loop") return ["boundedLoop"];
  if (type === "subworkflow") return ["nestedWorkflow"];
  if (type === "agent") return ["agentNode"];
  if (type === "human-approval") return ["humanApproval", "restartResume"];
  return [];
}

/** 递归收集顶层与容器子图所需能力，并保持固定 key 顺序。 */
export function requiredWorkflowStageECapabilities(nodes: readonly WorkflowNode[]): WorkflowStageECapability[] {
  const required = new Set<WorkflowStageECapability>();
  const visit = (current: readonly WorkflowNode[]): void => {
    for (const node of current) {
      for (const capability of workflowStageECapabilitiesForNodeType(node.type)) required.add(capability);
      if (node.kind === "builtin" && (node.type === "iteration" || node.type === "loop")) visit(node.config.body.nodes);
    }
  };
  visit(nodes);
  return WORKFLOW_STAGE_E_CAPABILITY_KEYS.filter((capability) => required.has(capability));
}

/** 跨控制面共享的工作流运行快照。 */
export type WorkflowRunSnapshot = {
  id: string;
  workflowId: string;
  versionId?: string;
  contentHash?: string;
  mode: WorkflowRunMode;
  status: WorkflowRunStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  inputs: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: WorkflowRuntimeError;
  nodeRuns: Record<string, WorkflowNodeRunSnapshot>;
  /** 阶段 E 容器实例投影；旧快照允许缺省。 */
  nodeInstances?: Record<string, WorkflowNodeInstanceRunSnapshot>;
  /** Agent/Subworkflow child run 投影；旧快照允许缺省。 */
  childRuns?: Record<string, WorkflowChildRunSnapshot>;
  /** 当前 waiting 节点及脱敏审批信息；Runtime 恢复证明不属于该字段。 */
  waiting?: WorkflowRunWaitingSnapshot;
  /** 由 Agent Runtime 写入；旧快照读取时允许缺省。 */
  runtimeBackend?: "mastra";
  adapterVersion?: string;
  nativeRunId?: string;
  runtimeVersion?: string;
  selectionReason?: string;
  verifiedCapabilities?: string[];
};

/** Agent 与 Workflow 事件可共享的最小运行事件信封。 */
export type RuntimeEventBase = {
  id: number;
  runId: string;
  at: number;
};

/** 容器实例或子运行附加到节点事件的稳定产品执行身份。 */
export type WorkflowExecutionEventIdentity = {
  containerId?: string;
  instanceId?: string;
  iterationIndex?: number;
  executionPath?: string[];
  childRunId?: string;
};

/** Human Approval waiting 事件可公开的最小脱敏元数据。 */
export type WorkflowWaitingMetadata = {
  kind: "approval";
  interruptId: string;
  /** 向后兼容字段；与 interruptId 相同，不是独立 Approval 产品资源。 */
  approvalRequestId: string;
  deadline: number;
  displayFields: ApprovalDisplayValue[];
  decisionSchema: WorkflowJsonSchema;
};

/** BFF、Web 与 Agent 共同消费的并发安全运行事件协议。 */
export type WorkflowRuntimeEvent =
  | (RuntimeEventBase & { type: "run.status"; status: WorkflowRunStatus; error?: WorkflowRuntimeError })
  | (RuntimeEventBase & WorkflowExecutionEventIdentity & { type: "node.status"; nodeId: string; status: WorkflowNodeRunStatus; attempt: number; error?: WorkflowRuntimeError })
  | (RuntimeEventBase & WorkflowExecutionEventIdentity & { type: "node.log"; nodeId: string; level: "debug" | "info" | "warning" | "error"; message: string })
  | (RuntimeEventBase & WorkflowExecutionEventIdentity & { type: "node.output"; nodeId: string; output: Record<string, unknown>; delta?: string })
  | (RuntimeEventBase & { type: "run.output"; output: Record<string, unknown> })
  | (RuntimeEventBase & { type: "run.waiting"; nodeId: string; reason: string; waiting?: WorkflowWaitingMetadata });

/** 判断运行状态是否为不可逆终态。 */
export function isTerminalWorkflowRunStatus(status: WorkflowRunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

/** 判断节点状态是否为不可逆终态。 */
export function isTerminalWorkflowNodeStatus(status: WorkflowNodeRunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "skipped" || status === "cancelled";
}

/** 生成 Web/BFF/Agent 共用的稳定节点实例 key。 */
export function workflowNodeInstanceKey(nodeId: string, instanceId: string): string {
  return `${nodeId}::${instanceId}`;
}

/** 将单个产品事件合并到运行查询投影，同时保持旧 nodeRuns 行为。 */
export function applyWorkflowRuntimeEventToSnapshot(
  run: WorkflowRunSnapshot,
  event: WorkflowRuntimeEvent,
): WorkflowRunSnapshot {
  if (event.runId !== run.id) return run;
  if (event.type === "run.status") {
    return {
      ...run,
      status: event.status,
      error: event.error ?? run.error,
      startedAt: event.status === "running" ? run.startedAt ?? event.at : run.startedAt,
      finishedAt: isTerminalWorkflowRunStatus(event.status) ? event.at : run.finishedAt,
      ...((event.status === "running" || isTerminalWorkflowRunStatus(event.status)) ? { waiting: undefined } : {}),
    };
  }
  if (event.type === "run.output") return { ...run, output: event.output };
  if (event.type === "run.waiting") {
    return {
      ...run,
      waiting: {
        nodeId: event.nodeId,
        reason: event.reason,
        ...(event.waiting ? { waiting: event.waiting } : {}),
      },
    };
  }
  if (event.type === "node.log") return run;
  const current = run.nodeRuns[event.nodeId] ?? { nodeId: event.nodeId, status: "pending" as const, attempt: 0 };
  const nodeRuns = event.type === "node.status"
    ? {
        ...run.nodeRuns,
        [event.nodeId]: {
          ...current,
          status: event.status,
          attempt: event.attempt,
          error: event.error ?? current.error,
          startedAt: event.status === "running" ? current.startedAt ?? event.at : current.startedAt,
          finishedAt: isTerminalWorkflowNodeStatus(event.status) ? event.at : current.finishedAt,
          durationMs: isTerminalWorkflowNodeStatus(event.status) && current.startedAt !== undefined
            ? event.at - current.startedAt
            : current.durationMs,
        },
      }
    : {
        ...run.nodeRuns,
        [event.nodeId]: { ...current, output: { ...(current.output ?? {}), ...event.output } },
      };
  let nodeInstances = run.nodeInstances;
  if (event.instanceId) {
    const key = workflowNodeInstanceKey(event.nodeId, event.instanceId);
    const instance = nodeInstances?.[key] ?? {
      nodeId: event.nodeId,
      instanceId: event.instanceId,
      status: "pending" as const,
      attempt: 0,
    };
    nodeInstances = {
      ...(nodeInstances ?? {}),
      [key]: event.type === "node.status"
        ? {
            ...instance,
            containerId: event.containerId,
            iterationIndex: event.iterationIndex,
            executionPath: event.executionPath,
            childRunId: event.childRunId,
            status: event.status,
            attempt: event.attempt,
            error: event.error ?? instance.error,
            startedAt: event.status === "running" ? instance.startedAt ?? event.at : instance.startedAt,
            finishedAt: isTerminalWorkflowNodeStatus(event.status) ? event.at : instance.finishedAt,
          }
        : {
            ...instance,
            containerId: event.containerId,
            iterationIndex: event.iterationIndex,
            executionPath: event.executionPath,
            childRunId: event.childRunId,
            output: { ...(instance.output ?? {}), ...event.output },
          },
    };
  }
  let childRuns = run.childRuns;
  if (event.childRunId) {
    const child = childRuns?.[event.childRunId] ?? {
      childRunId: event.childRunId,
      parentNodeId: event.nodeId,
      status: "pending" as const,
    };
    childRuns = {
      ...(childRuns ?? {}),
      [event.childRunId]: event.type === "node.status"
        ? {
            ...child,
            containerId: event.containerId,
            instanceId: event.instanceId,
            iterationIndex: event.iterationIndex,
            executionPath: event.executionPath,
            status: event.status,
            error: event.error ?? child.error,
          }
        : {
            ...child,
            containerId: event.containerId,
            instanceId: event.instanceId,
            iterationIndex: event.iterationIndex,
            executionPath: event.executionPath,
            output: { ...(child.output ?? {}), ...event.output },
          },
    };
  }
  return {
    ...run,
    nodeRuns,
    ...(nodeInstances ? { nodeInstances } : {}),
    ...(childRuns ? { childRuns } : {}),
  };
}

/** 按产品 event id 顺序重建阶段 E 查询投影。 */
export function projectWorkflowRuntimeEvents(
  run: WorkflowRunSnapshot,
  events: readonly WorkflowRuntimeEvent[],
): WorkflowRunSnapshot {
  return [...events]
    .sort((left, right) => left.id - right.id)
    .reduce(applyWorkflowRuntimeEventToSnapshot, run);
}
