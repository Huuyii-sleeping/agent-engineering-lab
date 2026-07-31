import type { HumanApprovalNodeConfig } from "@orbit/workflow-core";

const displayFieldId = () => `display-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;

/** 追加带稳定 id 的审批展示字段。 */
export function appendApprovalDisplayField(config: HumanApprovalNodeConfig, createId: () => string = displayFieldId): HumanApprovalNodeConfig {
  let id = createId();
  while (config.displayFields.some((field) => field.id === id)) id = createId();
  return {
    ...config,
    displayFields: [...config.displayFields, { id, label: `展示字段 ${config.displayFields.length + 1}`, value: { kind: "literal", value: "" } }],
  };
}

/** 将审批期限限制在 1ms 到 30 天的共享契约范围内。 */
export function clampApprovalDeadlineMs(value: number): number {
  return Math.min(30 * 24 * 60 * 60 * 1_000, Math.max(1, Number.isFinite(value) ? Math.round(value) : 1));
}
