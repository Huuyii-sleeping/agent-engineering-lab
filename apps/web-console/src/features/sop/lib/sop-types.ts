/** Web SOP 领域统一复用 workflow-core 契约，不在前端重复声明近似类型。 */
export type {
  BuiltinNodeType as SopNodeType,
  WorkflowDraft as SopDraft,
  WorkflowEdge as SopEdge,
  WorkflowNode as SopNode,
} from "@orbit/workflow-core";
