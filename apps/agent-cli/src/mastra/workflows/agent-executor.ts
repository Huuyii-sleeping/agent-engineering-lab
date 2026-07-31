import type { LlmNodeConfig, WorkflowIRNode } from "@orbit/workflow-core";
import type { AgentUsage } from "@orbit/runtime-contracts";
import type { WorkflowNodeExecutor } from "../../workflows/executor-registry.js";

/** Workflow LLM 节点使用的共享 Mastra Agent 执行边界。 */
export interface MastraWorkflowAgentResolver {
  stream(input: {
    workflowId: string;
    node: WorkflowIRNode;
    prompt: string;
    requestContext: Record<string, unknown>;
    runId: string;
    signal: AbortSignal;
    onDelta(delta: string): void;
  }): Promise<{ text: string; usage?: AgentUsage }>;
}

/** 将 LLM 节点委托给共享 Mastra Instance 中注册的 Agent。 */
export class MastraWorkflowAgentExecutor implements WorkflowNodeExecutor {
  readonly identity = { id: "workflow.llm", version: 1 } as const;

  constructor(private readonly resolver: MastraWorkflowAgentResolver) {}

  async execute(context: Parameters<WorkflowNodeExecutor["execute"]>[0]) {
    const workflowId = context.workflowId;
    if (!workflowId) throw new Error(`Workflow LLM 节点 ${context.node.id} 缺少 workflowId。`);
    const config = context.node.config as LlmNodeConfig;
    const prompt = String(await context.variables.resolveValue(config.prompt) ?? "");
    const result = await this.resolver.stream({
      workflowId,
      node: context.node,
      prompt,
      requestContext: context.requestContext ?? {},
      runId: context.runId,
      signal: context.signal,
      onDelta: context.emitDelta,
    });
    return { outputs: { text: result.text, usage: result.usage } };
  }
}
