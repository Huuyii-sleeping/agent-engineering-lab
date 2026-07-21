import { validateWorkflowDraft, type WorkflowValidationResult, type WorkflowDraft } from "@orbit/workflow-core";

/** Web 编辑器展示使用的发布前静态校验结果。 */
export type SopValidation = WorkflowValidationResult;

/** Web 端薄适配：校验规则由 workflow-core 统一维护。 */
export function validateSop(draft: WorkflowDraft): SopValidation {
  return validateWorkflowDraft(draft);
}
