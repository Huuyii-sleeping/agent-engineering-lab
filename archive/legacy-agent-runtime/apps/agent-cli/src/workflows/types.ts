import type { WorkflowIR, WorkflowNodeRunSnapshot, WorkflowRunMode, WorkflowRunSnapshot } from "@orbit/workflow-core";

/** 单个节点的一次或多次执行快照。 */
export type WorkflowNodeRun = WorkflowNodeRunSnapshot;

/** Agent runtime 内存中的工作流运行快照。 */
export type WorkflowRun = WorkflowRunSnapshot;

/** 启动 runtime 的输入。 */
export type StartWorkflowRunInput = {
  ir: WorkflowIR;
  mode: WorkflowRunMode;
  inputs?: Record<string, unknown>;
  targetNodeId?: string;
  nodeInputs?: Record<string, unknown>;
};
