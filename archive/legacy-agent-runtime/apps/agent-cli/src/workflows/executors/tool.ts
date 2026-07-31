import type { ToolNodeConfig } from "@orbit/workflow-core";
import type { ToolServiceLike } from "../../tools/service.js";
import type { WorkflowNodeExecutor } from "../executor-registry.js";

function parseToolResult(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

/** 通过现有 ToolService 和权限链执行 Tool 节点。 */
export class ToolWorkflowExecutor implements WorkflowNodeExecutor {
  readonly identity = { id: "workflow.tool", version: 1 } as const;
  constructor(private readonly toolService: Pick<ToolServiceLike, "runToolByName">) {}

  async execute(context: Parameters<WorkflowNodeExecutor["execute"]>[0]) {
    const config = context.node.config as ToolNodeConfig;
    const args = await context.variables.resolveValue(config.arguments) as Record<string, unknown>;
    context.emitLog("info", `调用工具 ${config.toolId}`);
    const output = await this.toolService.runToolByName(config.toolId, JSON.stringify(args));
    return { outputs: { result: parseToolResult(output) } };
  }
}
