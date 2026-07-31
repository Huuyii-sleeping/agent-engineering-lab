import type { ExecutorIdentity, WorkflowIRNode } from "@orbit/workflow-core";
import type { WorkflowVariableContext } from "./context.js";

/** 节点执行器收到的隔离上下文。 */
export type WorkflowExecutorContext = {
  runId: string;
  node: WorkflowIRNode;
  inputs: Record<string, unknown>;
  variables: WorkflowVariableContext;
  signal: AbortSignal;
  emitLog(level: "debug" | "info" | "warning" | "error", message: string): void;
  emitDelta(delta: string): void;
};

/** 节点执行结果；selectedPortIds 用于 Condition 和 error route。 */
export type WorkflowExecutorResult = {
  outputs: Record<string, unknown>;
  selectedPortIds?: string[];
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
