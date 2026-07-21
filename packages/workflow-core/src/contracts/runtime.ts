/** 工作流运行状态；终态不可逆。 */
export type WorkflowRunStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

/** 节点运行状态；ready 表示依赖已经满足。 */
export type WorkflowNodeRunStatus = "pending" | "ready" | "running" | "waiting" | "succeeded" | "failed" | "skipped" | "cancelled";

/** 工作流运行模式。 */
export type WorkflowRunMode = "node-test" | "draft" | "production";

/** 运行或节点失败的结构化错误。 */
export type WorkflowRuntimeError = {
  code: string;
  message: string;
  nodeId?: string;
  attempt?: number;
  details?: Record<string, unknown>;
};

type RuntimeEventBase = {
  id: number;
  runId: string;
  at: number;
};

/** BFF、Web 与 Agent 共同消费的并发安全运行事件协议。 */
export type WorkflowRuntimeEvent =
  | (RuntimeEventBase & { type: "run.status"; status: WorkflowRunStatus; error?: WorkflowRuntimeError })
  | (RuntimeEventBase & { type: "node.status"; nodeId: string; status: WorkflowNodeRunStatus; attempt: number; error?: WorkflowRuntimeError })
  | (RuntimeEventBase & { type: "node.log"; nodeId: string; level: "debug" | "info" | "warning" | "error"; message: string })
  | (RuntimeEventBase & { type: "node.output"; nodeId: string; output: Record<string, unknown>; delta?: string })
  | (RuntimeEventBase & { type: "run.output"; output: Record<string, unknown> })
  | (RuntimeEventBase & { type: "run.waiting"; nodeId: string; reason: string });

/** 判断运行状态是否为不可逆终态。 */
export function isTerminalWorkflowRunStatus(status: WorkflowRunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

/** 判断节点状态是否为不可逆终态。 */
export function isTerminalWorkflowNodeStatus(status: WorkflowNodeRunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "skipped" || status === "cancelled";
}
