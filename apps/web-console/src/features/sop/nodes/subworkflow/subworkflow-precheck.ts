import type { SubworkflowNodeConfig } from "@orbit/workflow-core";
import type { WorkflowVersionReferenceOption } from "../types";

/** Subworkflow 编辑阶段可立即判断的依赖问题。间接递归仍由发布校验解析。 */
export function precheckSubworkflowReference(
  config: SubworkflowNodeConfig,
  context: { currentWorkflowId: string; scopeDepth: number; options: readonly WorkflowVersionReferenceOption[] },
): Array<{ severity: "error" | "warning"; message: string }> {
  const issues: Array<{ severity: "error" | "warning"; message: string }> = [];
  if (!config.workflowId || !config.versionId || !config.contentHash) {
    issues.push({ severity: "warning", message: "请选择一个不可变发布版本。" });
    return issues;
  }
  if (config.workflowId === context.currentWorkflowId) issues.push({ severity: "error", message: "Subworkflow 不能直接引用当前 Workflow。" });
  if (context.scopeDepth + 1 > 5) issues.push({ severity: "error", message: "当前引用会超过最大嵌套深度 5。" });
  const selected = context.options.find((option) => option.workflowId === config.workflowId && option.versionId === config.versionId);
  if (!selected) issues.push({ severity: "error", message: "固定版本不存在或当前不可用。" });
  else if (selected.contentHash !== config.contentHash) issues.push({ severity: "error", message: "固定版本 contentHash 不匹配，请重新选择版本。" });
  return issues;
}
