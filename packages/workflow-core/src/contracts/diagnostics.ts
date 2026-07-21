/** 编译诊断严重级别。 */
export type DiagnosticSeverity = "error" | "warning";

/** 编译诊断可精确定位的实体类型。 */
export type DiagnosticLocation =
  | { kind: "workflow" }
  | { kind: "node"; nodeId: string }
  | { kind: "port"; nodeId: string; portId: string }
  | { kind: "field"; nodeId: string; fieldPath: string[] }
  | { kind: "edge"; edgeId: string };

/** 可由画布、问题面板和字段级 UI 共同消费的诊断。 */
export type WorkflowDiagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  location: DiagnosticLocation;
  hint?: string;
};

/** 判断诊断集合是否包含阻断发布的错误。 */
export function hasDiagnosticErrors(diagnostics: readonly WorkflowDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
