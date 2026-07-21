import type {
  WorkflowDraft,
  WorkflowRunMode,
  WorkflowNodeRunSnapshot,
  WorkflowRunSnapshot,
  WorkflowRuntimeEvent,
} from "@orbit/workflow-core";

/** Web 启动运行时使用的权威工作流引用。 */
export type StartWorkflowRunInput = {
  workflowId: string;
  mode: WorkflowRunMode;
  versionId?: string;
  draft?: WorkflowDraft;
  inputs?: Record<string, unknown>;
  targetNodeId?: string;
  nodeInputs?: Record<string, unknown>;
};

/** BFF 持久化的节点运行快照。 */
export type { WorkflowNodeRunSnapshot, WorkflowRunSnapshot };

/** Repository 只保存 Agent 产生的运行事实，不执行节点。 */
export interface WorkflowRunsRepository {
  saveRun(run: WorkflowRunSnapshot): void;
  getRun(runId: string): WorkflowRunSnapshot | null;
  saveEvent(event: WorkflowRuntimeEvent): boolean;
  listEvents(runId: string, sinceId?: number): WorkflowRuntimeEvent[];
}
