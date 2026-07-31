import { Check, RotateCcw, Trash2, TriangleAlert, X } from "lucide-react";
import type { Edge, Node } from "@xyflow/react";
import type { AvailableVariable, WorkflowDiagnostic, WorkflowNode } from "@orbit/workflow-core";
import type { AgentVersionReferenceCatalog, WorkflowReferenceCatalog } from "../../nodes/types";
import type { SopValidation } from "../../lib/sop-validate";
import type { SopFlowData, SopFlowEdgeData } from "../sop-flow-adapter";
import { SopJsonPanel } from "./SopJsonPanel";
import { SopNodeInspector } from "./SopNodeInspector";
import { SopSelectionActions } from "./SopSelectionActions";

/** 右侧检查器，根据 JSON、选择状态和诊断状态切换内容。 */
export function SopInspector(props: {
  open: boolean;
  showJson: boolean;
  name: string;
  jsonText: string;
  jsonError: string | null;
  selectedNodeIds: Set<string>;
  selectedNode: Node<SopFlowData> | null;
  selectedEdge: Edge<SopFlowEdgeData> | null;
  scopeNodes: WorkflowNode[];
  currentWorkflowId: string;
  scopeDepth: number;
  workflowReferences: WorkflowReferenceCatalog;
  agentReferences: AgentVersionReferenceCatalog;
  validation: SopValidation | null;
  availableVariables: AvailableVariable[];
  selectedDiagnostics: WorkflowDiagnostic[];
  onJsonTextChange: (text: string) => void;
  onImportJson: () => void;
  onCloseJson: () => void;
  onUpdateNode: (update: (node: WorkflowNode) => WorkflowNode) => void;
  onUpdateEdgeLabel: (label: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClearValidation: () => void;
  onFocusNode: (nodeId: string) => void;
  onToggleCollapsed: () => void;
  onEnterContainer: (nodeId: string) => void;
  onClose: () => void;
}) {
  let content;
  if (props.showJson) content = <SopJsonPanel name={props.name} text={props.jsonText} error={props.jsonError} onTextChange={props.onJsonTextChange} onImport={props.onImportJson} onClose={props.onCloseJson} />;
  else if (props.selectedNodeIds.size > 1) content = <div className="sop-insp-in"><div className="sop-insp-h">批量操作</div><div className="sop-info-row"><span className="sop-info-label">已选节点</span><span className="sop-info-val">{props.selectedNodeIds.size} 个</span></div><SopSelectionActions onDuplicate={props.onDuplicate} onDelete={props.onDelete} /></div>;
  else if (props.selectedNode) content = <SopNodeInspector node={props.selectedNode.data.node} scopeNodes={props.scopeNodes} currentWorkflowId={props.currentWorkflowId} scopeDepth={props.scopeDepth} workflowReferences={props.workflowReferences} agentReferences={props.agentReferences} availableVariables={props.availableVariables} diagnostics={props.selectedDiagnostics} collapsed={Boolean(props.selectedNode.data.collapsed)} onToggleCollapsed={props.onToggleCollapsed} onEnterContainer={props.onEnterContainer} onChange={(node) => props.onUpdateNode(() => node)} onDelete={props.onDelete} onDuplicate={props.onDuplicate} />;
  else if (props.selectedEdge) content = <div className="sop-insp-in"><div className="sop-insp-h">连线配置</div><label className="sop-field"><span>分支标签</span><input value={typeof props.selectedEdge.label === "string" ? props.selectedEdge.label : ""} onChange={(event) => props.onUpdateEdgeLabel(event.target.value)} /></label><div className="sop-info-row"><span className="sop-info-label">起点</span><span className="sop-info-mono">{props.selectedEdge.source}:{props.selectedEdge.sourceHandle}</span></div><div className="sop-info-row"><span className="sop-info-label">终点</span><span className="sop-info-mono">{props.selectedEdge.target}:{props.selectedEdge.targetHandle}</span></div><button type="button" className="btn btn-ghost btn-sm sop-del" onClick={props.onDelete}><Trash2 aria-hidden="true" />删除连线</button></div>;
  else content = <div className="sop-insp-in"><div className="sop-insp-h">流程校验</div>{props.validation ? <div className="sop-valid">{props.validation.ok ? <div className="sop-valid-ok"><Check width={14} height={14} aria-hidden="true" />校验通过</div> : <div className="sop-valid-err"><TriangleAlert width={14} height={14} aria-hidden="true" />{props.validation.errors.length} 个问题</div>}{props.validation.diagnostics.map((item) => <button type="button" key={`${item.code}-${item.message}`} className={`sop-valid-item sop-diagnostic-button ${item.severity === "error" ? "err" : "warn"}`} onClick={() => { if ("nodeId" in item.location) props.onFocusNode(item.location.nodeId); }}>{item.message}</button>)}</div> : <div className="sop-insp-empty">点击「校验流程」检查 DAG；选中节点或连线可在此编辑。</div>}<button type="button" className="btn btn-ghost btn-sm sop-del" onClick={props.onClearValidation}><RotateCcw aria-hidden="true" />清除校验</button></div>;
  return <aside className={`sop-insp ${props.open ? "is-open" : ""}`} aria-label="节点与流程配置"><button type="button" className="sop-panel-close sop-inspector-close" aria-label="关闭配置面板" onClick={props.onClose}><X aria-hidden="true" /></button>{content}</aside>;
}
