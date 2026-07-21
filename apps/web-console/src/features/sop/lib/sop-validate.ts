import {
  checkPortConnection,
  findCycle,
  findReachableNodeIds,
  isVariableRefAvailable,
  validateNodeConfig,
  type VariableRef,
  type WorkflowDiagnostic,
  type WorkflowDraft,
} from "@orbit/workflow-core";

/** 发布前静态校验结果。 */
export type SopValidation = { ok: boolean; errors: string[]; warnings: string[]; diagnostics: WorkflowDiagnostic[] };

function collectVariableRefs(value: unknown, refs: VariableRef[] = []): VariableRef[] {
  if (!value || typeof value !== "object") return refs;
  const record = value as Record<string, unknown>;
  if (record.kind === "variable" && record.ref && typeof record.ref === "object") {
    refs.push(record.ref as VariableRef);
    return refs;
  }
  if (typeof record.scope === "string" && ["workflow-input", "node-output", "system", "environment", "secret", "loop"].includes(record.scope)) {
    refs.push(record as VariableRef);
    return refs;
  }
  for (const child of Array.isArray(value) ? value : Object.values(record)) collectVariableRefs(child, refs);
  return refs;
}

const diagnostic = (code: string, severity: "error" | "warning", message: string, location: WorkflowDiagnostic["location"]): WorkflowDiagnostic => ({ code, severity, message, location });

/** 校验图结构、节点配置、端口、变量、必填输入和首期资源上限。 */
export function validateSop(draft: WorkflowDraft): SopValidation {
  const diagnostics: WorkflowDiagnostic[] = [];
  if (draft.nodes.length === 0) diagnostics.push(diagnostic("workflow.empty", "error", "画布为空，请先添加节点。", { kind: "workflow" }));
  if (draft.nodes.length > 200) diagnostics.push(diagnostic("workflow.node-limit", "error", `节点数 ${draft.nodes.length} 超过上限 200。`, { kind: "workflow" }));
  if (draft.edges.length > 400) diagnostics.push(diagnostic("workflow.edge-limit", "error", `连边数 ${draft.edges.length} 超过上限 400。`, { kind: "workflow" }));

  const starts = draft.nodes.filter((node) => node.type === "start");
  if (starts.length !== 1) diagnostics.push(diagnostic("workflow.start-count", "error", starts.length === 0 ? "缺少「开始」节点，流程无法启动。" : `存在 ${starts.length} 个「开始」节点，只能有 1 个。`, { kind: "workflow" }));
  if (!draft.nodes.some((node) => node.type === "end")) diagnostics.push(diagnostic("workflow.missing-end", "warning", "缺少「结束」节点，流程没有明确出口。", { kind: "workflow" }));

  if (starts.length > 0) {
    const reachable = findReachableNodeIds(draft.nodes, draft.edges, starts.map((node) => node.id));
    for (const node of draft.nodes) if (!reachable.has(node.id)) diagnostics.push(diagnostic("node.unreachable", "error", `节点「${node.label}」无法从开始节点到达。`, { kind: "node", nodeId: node.id }));
  }
  const cycle = findCycle(draft.nodes, draft.edges);
  if (cycle) diagnostics.push(diagnostic("workflow.cycle", "error", `流程存在环：${cycle.join(" → ")}。`, { kind: "workflow" }));

  for (const edge of draft.edges) {
    const result = checkPortConnection(draft.nodes, edge.source, edge.target);
    if (!result.valid) diagnostics.push(diagnostic("edge.invalid-port", "error", result.reason, { kind: "edge", edgeId: edge.id }));
  }
  for (const node of draft.nodes) {
    diagnostics.push(...validateNodeConfig(node));
    for (const port of node.ports.inputs.filter((item) => item.required)) {
      if (!draft.edges.some((edge) => edge.target.nodeId === node.id && edge.target.portId === port.id && edge.status !== "needs-repair")) diagnostics.push(diagnostic("port.required", "error", `必填输入「${port.name}」尚未连接。`, { kind: "port", nodeId: node.id, portId: port.id }));
    }
    const config = node.kind === "builtin" ? node.config : node.original;
    for (const ref of collectVariableRefs(config)) if (!isVariableRefAvailable(draft, node.id, ref, { system: [{ key: "runId", dataType: "string" }, { key: "currentTime", dataType: "string" }], environment: [{ key: "ORBIT_ENV", dataType: "string" }] })) diagnostics.push(diagnostic("variable.unavailable", "error", "变量引用不可达、已失效或不在当前作用域。", { kind: "node", nodeId: node.id }));
  }
  const errors = diagnostics.filter((item) => item.severity === "error").map((item) => item.message);
  const warnings = diagnostics.filter((item) => item.severity === "warning").map((item) => item.message);
  return { ok: errors.length === 0, errors, warnings, diagnostics };
}
