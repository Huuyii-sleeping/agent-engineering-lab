import type { WorkflowDiagnostic } from "@orbit/workflow-core";

/** 将共享发布诊断转换为 inspector 中可直接理解的定位文本。 */
export function formatInspectorDiagnostic(diagnostic: WorkflowDiagnostic): string {
  if (diagnostic.location.kind === "field") return `字段 ${diagnostic.location.fieldPath.join(".")}：${diagnostic.message}`;
  if (diagnostic.location.kind === "edge") return `连线 ${diagnostic.location.edgeId}：${diagnostic.message}`;
  if (diagnostic.location.kind === "port") return `端口 ${diagnostic.location.portId}：${diagnostic.message}`;
  return diagnostic.message;
}
