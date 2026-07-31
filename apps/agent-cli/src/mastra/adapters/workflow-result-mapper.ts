import {
  isTerminalWorkflowRunStatus,
  type WorkflowIR,
  type WorkflowIRNode,
  type WorkflowNodeRunSnapshot,
  type WorkflowRunSnapshot,
  type WorkflowRuntimeError,
  type WorkflowWaitingMetadata,
} from "@orbit/workflow-core";
import type { StoredMastraWorkflowRun } from "../storage/workflow-run-repository.js";
import type { MastraWorkflowFrame } from "../workflows/frame.js";

type NativeStepResult = {
  status?: string;
  output?: unknown;
  error?: unknown;
  startedAt?: number;
  endedAt?: number;
};

/** Mastra Workflow result 中 Adapter 需要消费的源类型子集。 */
export type NativeWorkflowResult = {
  status?: string;
  result?: MastraWorkflowFrame;
  input?: MastraWorkflowFrame;
  steps?: Record<string, NativeStepResult>;
  error?: unknown;
  tripwire?: { reason?: string; metadata?: unknown };
  suspendPayload?: unknown;
};

function waitingMetadata(value: unknown): WorkflowWaitingMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const wrapper = value as Record<string, unknown>;
  const record = wrapper.kind === "approval"
    ? wrapper
    : Object.values(wrapper).find((item): item is Record<string, unknown> => (
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
      && (item as Record<string, unknown>).kind === "approval"
    ));
  if (
    !record
    || typeof record.interruptId !== "string"
    || typeof record.approvalRequestId !== "string"
    || typeof record.deadline !== "number"
    || !Array.isArray(record.displayFields)
    || !record.decisionSchema
    || typeof record.decisionSchema !== "object"
    || Array.isArray(record.decisionSchema)
  ) return undefined;
  return {
    kind: "approval",
    interruptId: record.interruptId,
    approvalRequestId: record.approvalRequestId,
    deadline: record.deadline,
    displayFields: record.displayFields as WorkflowWaitingMetadata["displayFields"],
    decisionSchema: record.decisionSchema as WorkflowWaitingMetadata["decisionSchema"],
  };
}

function isFrame(value: unknown): value is MastraWorkflowFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<MastraWorkflowFrame>;
  return typeof frame.productRunId === "string" && Boolean(frame.nodeOutputs) && Boolean(frame.selectedPorts);
}

function resultFrame(result: NativeWorkflowResult, ir: WorkflowIR): MastraWorkflowFrame | undefined {
  if (isFrame(result.result)) return result.result;
  for (const nodeId of [...ir.topology.orderedNodeIds].reverse()) {
    const output = result.steps?.[nodeId]?.output;
    if (isFrame(output)) return output;
  }
  return isFrame(result.input) ? result.input : undefined;
}

function runtimeError(error: unknown, nodeId?: string, attempt?: number): WorkflowRuntimeError {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    code: typeof value.code === "string" ? value.code : "MASTRA_WORKFLOW_EXECUTION_FAILED",
    message: error instanceof Error
      ? error.message
      : typeof value.message === "string"
        ? value.message
        : String(error ?? "Mastra Workflow 执行失败。"),
    nodeId,
    attempt,
    details: value.details && typeof value.details === "object"
      ? value.details as Record<string, unknown>
      : undefined,
  };
}

function runStatus(status: string | undefined, cancelled: boolean): WorkflowRunSnapshot["status"] {
  if (cancelled || status === "canceled") return "cancelled";
  if (status === "success") return "succeeded";
  if (status === "failed" || status === "tripwire" || status === "bailed") return "failed";
  if (status === "suspended" || status === "waiting" || status === "paused") return "waiting";
  return "running";
}

function nativeStepForNode(node: WorkflowIRNode, result: NativeWorkflowResult): NativeStepResult | undefined {
  return result.steps?.[node.id]
    ?? (node.kind === "parallel" || node.kind === "iteration" || node.kind === "loop" || node.kind === "subworkflow"
      ? result.steps?.[`${node.id}-container`]
      : undefined);
}

function nodeStatus(
  node: WorkflowIRNode,
  result: NativeWorkflowResult,
  frame: MastraWorkflowFrame | undefined,
  status: WorkflowRunSnapshot["status"],
): WorkflowNodeRunSnapshot["status"] {
  if (frame?.skippedNodeIds.includes(node.id)) return "skipped";
  const step = nativeStepForNode(node, result);
  if (step?.status === "failed") return "failed";
  if (step?.status === "suspended" || step?.status === "waiting" || step?.status === "paused") return "waiting";
  if (step?.status === "running") return "running";
  if (step?.status === "skipped") return "skipped";
  if (frame && Object.prototype.hasOwnProperty.call(frame.nodeOutputs, node.id)) return "succeeded";
  if (status === "cancelled") return "cancelled";
  return status === "running" ? "pending" : "skipped";
}

/** 只保留可安全写入 Mastra snapshot 的 Workflow request context 字段。 */
export function safeWorkflowRequestContext(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  const allowedKeys = ["ownerId", "sessionId", "traceId", "correlationId", "tenantId", "projectId"];
  return Object.fromEntries(allowedKeys.flatMap((key) => value[key] === undefined ? [] : [[key, value[key]]]));
}

/** 将 Mastra 原生状态、step result 和 tripwire 映射为产品 Workflow 快照。 */
export function mapMastraWorkflowResult(
  record: StoredMastraWorkflowRun,
  result: NativeWorkflowResult,
  cancelled: boolean,
  now = Date.now(),
): WorkflowRunSnapshot {
  const previous = record.snapshot;
  const status = runStatus(result.status, cancelled);
  const frame = resultFrame(result, record.ir);
  const nodeRuns = Object.fromEntries(record.ir.nodes.map((node) => {
    const step = nativeStepForNode(node, result);
    const statusForNode = nodeStatus(node, result, frame, status);
    const error = statusForNode === "failed" ? runtimeError(step?.error ?? result.error, node.id, 1) : undefined;
    return [node.id, {
      nodeId: node.id,
      status: statusForNode,
      attempt: statusForNode === "pending" || statusForNode === "skipped" ? 0 : 1,
      startedAt: step?.startedAt,
      finishedAt: step?.endedAt ?? (statusForNode === "succeeded" || statusForNode === "failed" ? now : undefined),
      durationMs: step?.startedAt && (step.endedAt ?? now) ? (step.endedAt ?? now) - step.startedAt : undefined,
      output: frame?.nodeOutputs[node.id],
      error,
    } satisfies WorkflowNodeRunSnapshot];
  }));
  const failedNode = Object.values(nodeRuns).find((node) => node.status === "failed");
  const waitingNode = Object.values(nodeRuns).find((node) => node.status === "waiting");
  const waiting = waitingMetadata(result.suspendPayload);
  const error = status === "failed"
    ? result.status === "tripwire"
      ? {
        code: "MASTRA_WORKFLOW_TRIPWIRE",
        message: result.tripwire?.reason ?? "Mastra Workflow tripwire。",
        details: result.tripwire?.metadata && typeof result.tripwire.metadata === "object"
          ? result.tripwire.metadata as Record<string, unknown>
          : undefined,
      }
      : failedNode?.error ?? runtimeError(result.error)
    : status === "cancelled"
      ? { code: "RUNTIME_CANCELLED", message: "Workflow run 已取消。" }
      : undefined;
  return {
    ...previous,
    status,
    startedAt: previous.startedAt ?? previous.createdAt,
    finishedAt: isTerminalWorkflowRunStatus(status) ? now : undefined,
    output: status === "succeeded" ? frame?.output ?? {} : previous.output,
    error,
    nodeRuns,
    waiting: status === "waiting" && waitingNode
      ? { nodeId: waitingNode.nodeId, reason: "Human approval pending", ...(waiting ? { waiting } : {}) }
      : undefined,
  };
}

/** 将未处于终态的产品快照收敛为 cancelled。 */
export function cancelledWorkflowSnapshot(snapshot: WorkflowRunSnapshot, now = Date.now()): WorkflowRunSnapshot {
  return {
    ...snapshot,
    status: "cancelled",
    finishedAt: now,
    error: { code: "RUNTIME_CANCELLED", message: "Workflow run 已取消。" },
    nodeRuns: Object.fromEntries(Object.entries(snapshot.nodeRuns).map(([nodeId, node]) => [
      nodeId,
      node.status === "succeeded" || node.status === "failed" || node.status === "skipped"
        ? node
        : { ...node, status: "cancelled", finishedAt: now },
    ])),
  };
}
