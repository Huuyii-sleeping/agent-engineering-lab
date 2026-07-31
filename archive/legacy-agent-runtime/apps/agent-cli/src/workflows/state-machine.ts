import {
  isTerminalWorkflowNodeStatus,
  isTerminalWorkflowRunStatus,
  type WorkflowNodeRunStatus,
  type WorkflowRunStatus,
} from "@orbit/workflow-core";

const RUN_TRANSITIONS: Record<WorkflowRunStatus, WorkflowRunStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["waiting", "succeeded", "failed", "cancelled"],
  waiting: ["running", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const NODE_TRANSITIONS: Record<WorkflowNodeRunStatus, WorkflowNodeRunStatus[]> = {
  pending: ["ready", "skipped", "cancelled"],
  ready: ["running", "skipped", "cancelled"],
  running: ["waiting", "succeeded", "failed", "cancelled"],
  waiting: ["running", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  skipped: [],
  cancelled: [],
};

/** 校验并返回新的运行状态。 */
export function transitionRunStatus(current: WorkflowRunStatus, next: WorkflowRunStatus): WorkflowRunStatus {
  if (isTerminalWorkflowRunStatus(current)) throw new Error(`工作流运行已进入终态 ${current}，不能转换为 ${next}。`);
  if (!RUN_TRANSITIONS[current].includes(next)) throw new Error(`非法工作流状态转换：${current} -> ${next}。`);
  return next;
}

/** 校验并返回新的节点状态。 */
export function transitionNodeStatus(current: WorkflowNodeRunStatus, next: WorkflowNodeRunStatus): WorkflowNodeRunStatus {
  if (isTerminalWorkflowNodeStatus(current)) throw new Error(`节点运行已进入终态 ${current}，不能转换为 ${next}。`);
  if (!NODE_TRANSITIONS[current].includes(next)) throw new Error(`非法节点状态转换：${current} -> ${next}。`);
  return next;
}
