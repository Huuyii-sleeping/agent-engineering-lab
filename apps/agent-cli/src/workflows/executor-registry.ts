import type {
  ExecutorIdentity,
  WorkflowExecutionEventIdentity,
  WorkflowIRNode,
} from "@orbit/workflow-core";
import type { WorkflowVariableContext } from "./context.js";

/** 节点执行器收到的隔离上下文。 */
export type WorkflowExecutorContext = {
  runId: string;
  workflowId?: string;
  /** Mastra native run identity；Human Approval 只将其作为不透明 checkpoint 定位信息。 */
  nativeRunId?: string;
  /** 当前不可变 WorkflowVersion identity；草稿运行时允许缺省。 */
  workflowVersionId?: string;
  node: WorkflowIRNode;
  /** 当前节点实例 identity；容器内运行时包含父实例坐标。 */
  nodeInstanceId?: string;
  /** 当前 executor attempt，从 1 开始。 */
  attempt: number;
  inputs: Record<string, unknown>;
  requestContext?: Record<string, unknown>;
  resumeData?: unknown;
  variables: WorkflowVariableContext;
  signal: AbortSignal;
  /** 当前产品节点实例的稳定事件身份；executor 只能追加自身 child run identity。 */
  executionIdentity?: WorkflowExecutionEventIdentity;
  emitLog(
    level: "debug" | "info" | "warning" | "error",
    message: string,
    identity?: WorkflowExecutionEventIdentity,
  ): void;
  emitDelta(delta: string, identity?: WorkflowExecutionEventIdentity): void;
};

/** 节点执行结果；selectedPortIds 用于 Condition 和 error route。 */
export type WorkflowExecutorResult = {
  outputs: Record<string, unknown>;
  selectedPortIds?: string[];
  suspend?: { payload?: unknown; reason: string };
  /** 节点终态事件需要保留的稳定实例或 child run identity。 */
  eventIdentity?: WorkflowExecutionEventIdentity;
};

/** Agent runtime 节点执行器契约。 */
export type WorkflowNodeExecutor = {
  identity: ExecutorIdentity;
  execute(context: WorkflowExecutorContext): Promise<WorkflowExecutorResult>;
};

function key(identity: ExecutorIdentity): string {
  return `${identity.id}@${identity.version}`;
}

/** 稳定 executor identity 注册表。 */
export class WorkflowExecutorRegistry {
  private readonly executors = new Map<string, WorkflowNodeExecutor>();

  register(executor: WorkflowNodeExecutor): this {
    const identity = key(executor.identity);
    if (this.executors.has(identity)) throw new Error(`重复注册工作流执行器 ${identity}。`);
    this.executors.set(identity, executor);
    return this;
  }

  get(identity: ExecutorIdentity): WorkflowNodeExecutor | undefined {
    return this.executors.get(key(identity));
  }

  require(identity: ExecutorIdentity): WorkflowNodeExecutor {
    const executor = this.get(identity);
    if (!executor) throw new Error(`缺少工作流执行器 ${key(identity)}。`);
    return executor;
  }

  identities(): ExecutorIdentity[] {
    return [...this.executors.values()].map((executor) => executor.identity);
  }
}
