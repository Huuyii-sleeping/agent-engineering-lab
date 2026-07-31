import type { ToolNodeConfig } from "@orbit/workflow-core";
import type { WorkflowNodeExecutor } from "../../workflows/executor-registry.js";
import { MastraToolExecutionAdapter } from "../tools/tool-execution-adapter.js";

/** 通过 Mastra Tool Adapter 执行 Workflow Tool 节点。 */
export class MastraWorkflowToolExecutor implements WorkflowNodeExecutor {
  readonly identity = { id: "workflow.tool", version: 1 } as const;

  constructor(private readonly tools: MastraToolExecutionAdapter) {}

  async execute(context: Parameters<WorkflowNodeExecutor["execute"]>[0]) {
    const ownerId = typeof context.requestContext?.ownerId === "string"
      ? context.requestContext.ownerId
      : "";
    if (!ownerId) throw new Error(`Workflow Tool 节点 ${context.node.id} 缺少 ownerId。`);
    const workflowId = context.workflowId;
    if (!workflowId) throw new Error(`Workflow Tool 节点 ${context.node.id} 缺少 workflowId。`);
    const config = context.node.config as ToolNodeConfig;
    const toolInput = await context.variables.resolveValue(config.arguments);
    const output = await this.tools.executeForWorkflow({
      toolId: config.toolId,
      toolInput,
      ownerId,
      workflowId,
      runId: context.runId,
      nodeId: context.node.id,
      requestContext: context.requestContext,
      abortSignal: context.signal,
    });
    return { outputs: { result: output } };
  }
}
