import { Box } from "lucide-react";
import type { AvailableVariable, WorkflowDiagnostic, WorkflowNode } from "@orbit/workflow-core";
import { getSopNodeMeta } from "../../lib/sop-catalog";
import { nodeInspectorRegistry } from "../../nodes/inspector-registry";
import { formatInspectorDiagnostic } from "../../nodes/inspector-diagnostics";
import { SopSelectionActions } from "./SopSelectionActions";
import type { AgentVersionReferenceCatalog, WorkflowReferenceCatalog } from "../../nodes/types";

/** 单节点配置面板，通用字段与类型专属配置分离。 */
export function SopNodeInspector({ node, onChange, onDelete, onDuplicate, scopeNodes, currentWorkflowId, scopeDepth, workflowReferences, agentReferences, availableVariables, diagnostics, collapsed, onToggleCollapsed, onEnterContainer }: {
  node: WorkflowNode;
  onChange: (node: WorkflowNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  scopeNodes: WorkflowNode[];
  currentWorkflowId: string;
  scopeDepth: number;
  workflowReferences: WorkflowReferenceCatalog;
  agentReferences: AgentVersionReferenceCatalog;
  availableVariables: AvailableVariable[];
  diagnostics: WorkflowDiagnostic[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onEnterContainer: (nodeId: string) => void;
}) {
  const meta = getSopNodeMeta(node.type);
  const SpecificInspector = node.kind === "builtin" ? nodeInspectorRegistry[node.type] : null;
  const editableContainer = node.kind === "builtin" && (node.type === "iteration" || node.type === "loop");
  return (
    <div className="sop-insp-in">
      <div className="sop-insp-h"><span className="dot" style={{ background: meta.color }} />节点配置</div>
      <div className="sop-info-row"><span className="sop-info-label">类型</span><span className="sop-info-val" style={{ color: meta.color }}>{meta.label}</span></div>
      <div className="sop-info-row"><span className="sop-info-label">ID</span><span className="sop-info-val sop-info-mono">{node.id}</span></div>
      <div className="sop-sep" />
      <label className="sop-field"><span>名称</span><input value={node.label} onChange={(event) => onChange({ ...node, label: event.target.value })} /></label>
      <label className="sop-field"><span>备注</span><textarea rows={3} value={node.description ?? ""} onChange={(event) => onChange({ ...node, description: event.target.value })} /></label>
      {editableContainer ? <button type="button" className="btn btn-primary btn-sm sop-enter-container" onClick={() => onEnterContainer(node.id)}><Box aria-hidden="true" />编辑内部流程</button> : null}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleCollapsed}>{collapsed ? "展开节点" : "折叠节点"}</button>
      <div className="sop-sep" />
      {diagnostics.map((item) => <div key={`${item.code}-${item.message}`} className={`sop-valid-item ${item.severity === "error" ? "err" : "warn"}`}>{formatInspectorDiagnostic(item)}</div>)}
      {SpecificInspector ? <SpecificInspector node={node} onChange={onChange} scopeNodes={scopeNodes} currentWorkflowId={currentWorkflowId} scopeDepth={scopeDepth} workflowReferences={workflowReferences} agentReferences={agentReferences} availableVariables={availableVariables} diagnostics={diagnostics} /> : <div className="sop-valid-item err">当前环境未安装此节点，只读保留原始配置。</div>}
      <div className="sop-sep" />
      <SopSelectionActions onDuplicate={onDuplicate} onDelete={onDelete} />
    </div>
  );
}
