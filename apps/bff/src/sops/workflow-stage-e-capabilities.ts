import {
  DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES,
  normalizeWorkflowStageECapabilities,
  type WorkflowStageECapabilityRegistry,
} from "@orbit/workflow-core";

/** Nest 注入阶段 E 生产发布能力矩阵的稳定 token。 */
export const WORKFLOW_STAGE_E_CAPABILITY_REGISTRY = Symbol("WORKFLOW_STAGE_E_CAPABILITY_REGISTRY");

/** BFF 未显式配置时使用共享的逐项验证生产矩阵。 */
export function resolveWorkflowStageECapabilities(
  value?: Partial<WorkflowStageECapabilityRegistry>,
): WorkflowStageECapabilityRegistry {
  return value ? normalizeWorkflowStageECapabilities(value) : DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES;
}
