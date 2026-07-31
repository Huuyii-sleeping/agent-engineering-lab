import type { WorkflowJsonSchema } from "./json-schema.js";

/** Human Approval interrupt 接受的业务动作。 */
export type ApprovalDecisionAction = "approve" | "reject";

/** 已计算并脱敏的审批展示字段。 */
export type ApprovalDisplayValue = {
  id: string;
  label: string;
  value: unknown;
};

/** 审批决定的结构化数据契约，来源于已发布 WorkflowVersion。 */
export type ApprovalDecisionSchema = WorkflowJsonSchema;

/** 判断未知值是否为审批决定动作。 */
export function isApprovalDecisionAction(value: unknown): value is ApprovalDecisionAction {
  return value === "approve" || value === "reject";
}
