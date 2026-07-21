import type {
  WorkflowIR,
  WorkflowNodeRunStatus,
  WorkflowRunMode,
  WorkflowRunStatus,
  WorkflowRuntimeError,
} from "@orbit/workflow-core";

/** 单个节点的一次或多次执行快照。 */
export type WorkflowNodeRun = {
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

/** Agent runtime 内存中的工作流运行快照。 */
export type WorkflowRun = {
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
  nodeRuns: Record<string, WorkflowNodeRun>;
};

/** 启动 runtime 的输入。 */
export type StartWorkflowRunInput = {
  ir: WorkflowIR;
  mode: WorkflowRunMode;
  inputs?: Record<string, unknown>;
  targetNodeId?: string;
  nodeInputs?: Record<string, unknown>;
};
