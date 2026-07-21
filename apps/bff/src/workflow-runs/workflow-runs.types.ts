import type {
  WorkflowNodeRunStatus,
  WorkflowRunMode,
  WorkflowRunStatus,
  WorkflowRuntimeError,
  WorkflowRuntimeEvent,
} from "@orbit/workflow-core";

/** Web 启动运行时使用的权威工作流引用。 */
export type StartWorkflowRunInput = {
  workflowId: string;
  mode: WorkflowRunMode;
  versionId?: string;
  inputs?: Record<string, unknown>;
  targetNodeId?: string;
  nodeInputs?: Record<string, unknown>;
};

/** BFF 持久化的节点运行快照。 */
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
};

/** Agent 返回且由 BFF 建立索引的运行快照。 */
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
};

/** Repository 只保存 Agent 产生的运行事实，不执行节点。 */
export interface WorkflowRunsRepository {
  saveRun(run: WorkflowRunSnapshot): void;
  getRun(runId: string): WorkflowRunSnapshot | null;
  saveEvent(event: WorkflowRuntimeEvent): boolean;
  listEvents(runId: string, sinceId?: number): WorkflowRuntimeEvent[];
}
