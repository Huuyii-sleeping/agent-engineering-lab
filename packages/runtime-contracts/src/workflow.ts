import type {
  WorkflowDraft,
  AgentVersion,
  WorkflowRunMode,
  WorkflowRunSnapshot,
  WorkflowRuntimeEvent,
  WorkflowStageECapabilityRegistry,
  WorkflowVersion,
} from "@orbit/workflow-core";
import type { RuntimeBinding } from "./common.js";

/** Workflow Runtime 接受的权威产品定义。 */
export type WorkflowExecutionDefinition = WorkflowDraft | WorkflowVersion;

/** 启动一次 SOP Workflow run。 */
export type StartWorkflowRunCommand = {
  runId?: string;
  workflow: WorkflowExecutionDefinition;
  mode: WorkflowRunMode;
  inputs?: Record<string, unknown>;
  targetNodeId?: string;
  nodeInputs?: Record<string, unknown>;
  requestContext?: Record<string, unknown>;
  /** 创建边界选定后由 Runtime Router 注入的可信不可变绑定。 */
  runtimeBinding?: RuntimeBinding;
  /** 创建前 capability gate 使用的可信产品能力要求。 */
  requiredRuntimeCapabilities?: string[];
  /** 由可信产品层解析的不可变 Subworkflow 版本闭包；Runtime 只用于确定性编译。 */
  workflowDependencies?: WorkflowVersion[];
  /** 由可信产品层解析的不可变 AgentVersion 闭包；客户端不得覆盖版本运行字段。 */
  agentDependencies?: AgentVersion[];
  /** 由可信产品层确认可用的审批策略 identity；仅用于确定性运行时编译。 */
  approvalPolicyIds?: string[];
};

/** 取消仍在执行的 Workflow run。 */
export type CancelWorkflowRunCommand = {
  runId: string;
  reason?: string;
};

/** 从产品事件游标订阅 Workflow run。 */
export type WorkflowRuntimeEventQuery = {
  runId: string;
  sinceId?: number;
};

/** 恢复 waiting/suspended Workflow run。 */
export type ResumeWorkflowRunCommand = {
  runId: string;
  stepId?: string;
  resumeData: Record<string, unknown>;
  forEachIndex?: number;
  /** 绑定当前 run suspended step 的通用 interrupt 决定。 */
  interrupt?: {
    interruptId: string;
    action: "approve" | "reject";
    idempotencyKey: string;
  };
};

/** Workflow Adapter 对外声明的真实能力矩阵。 */
export type WorkflowRuntimeCapabilities = {
  start: boolean;
  query: boolean;
  cancel: boolean;
  events: boolean;
  eventReplay: boolean;
  resume: boolean;
  snapshots: boolean;
  restartRecovery: boolean;
  /** 旧 Port 实现允许缺省；Mastra Adapter 返回完整七项阶段 E 能力矩阵。 */
  stageE?: WorkflowStageECapabilityRegistry;
};

/** SOP 执行的框架无关端口。 */
export interface WorkflowRuntimePort {
  capabilities(): Promise<WorkflowRuntimeCapabilities>;
  start(command: StartWorkflowRunCommand): Promise<WorkflowRunSnapshot>;
  get(runId: string): Promise<WorkflowRunSnapshot | null>;
  cancel(command: CancelWorkflowRunCommand): Promise<WorkflowRunSnapshot>;
  events(query: WorkflowRuntimeEventQuery): AsyncIterable<WorkflowRuntimeEvent>;
  resume(command: ResumeWorkflowRunCommand): Promise<WorkflowRunSnapshot>;
}

export type { WorkflowRunSnapshot, WorkflowRuntimeEvent };
