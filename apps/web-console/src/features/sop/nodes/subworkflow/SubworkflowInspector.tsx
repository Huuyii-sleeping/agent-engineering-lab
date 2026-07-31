import { RefreshCw } from "lucide-react";
import type { NodeConfigInspectorProps } from "../types";
import { StageECapabilityNotice } from "../stage-e/StageEContractInspector";
import { precheckSubworkflowReference } from "./subworkflow-precheck";

const optionValue = (workflowId: string, versionId: string) => `${encodeURIComponent(workflowId)}::${encodeURIComponent(versionId)}`;

/** Subworkflow 不可变版本选择与依赖预检面板。 */
export function SubworkflowInspector({ node, onChange, currentWorkflowId, scopeDepth, workflowReferences, diagnostics }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "subworkflow") return null;
  const selectedValue = node.config.workflowId && node.config.versionId ? optionValue(node.config.workflowId, node.config.versionId) : "";
  const selectedExists = workflowReferences.options.some((option) => optionValue(option.workflowId, option.versionId) === selectedValue);
  const issues = precheckSubworkflowReference(node.config, { currentWorkflowId, scopeDepth, options: workflowReferences.options });
  const dependencyDiagnostics = diagnostics.filter((item) => /subworkflow|recursive|depth/i.test(`${item.code} ${item.message}`));
  return (
    <>
      <StageECapabilityNotice type={node.type} />
      <div className="sop-reference-heading"><div className="sop-field-group-title">固定发布版本</div><button type="button" aria-label="刷新 Workflow 版本" onClick={workflowReferences.refresh}><RefreshCw aria-hidden="true" /></button></div>
      <label className="sop-field"><span>Workflow / Version</span><select value={selectedValue} disabled={workflowReferences.state === "loading"} onChange={(event) => {
        const option = workflowReferences.options.find((candidate) => optionValue(candidate.workflowId, candidate.versionId) === event.target.value);
        if (option) onChange({ ...node, config: { ...node.config, workflowId: option.workflowId, versionId: option.versionId, contentHash: option.contentHash } });
      }}>
        <option value="">{workflowReferences.state === "loading" ? "正在读取发布版本…" : "选择不可变发布版本"}</option>
        {!selectedExists && selectedValue ? <option value={selectedValue}>当前引用不可用 · {node.config.versionId}</option> : null}
        {workflowReferences.options.map((option) => <option key={optionValue(option.workflowId, option.versionId)} value={optionValue(option.workflowId, option.versionId)} disabled={option.workflowId === currentWorkflowId}>{option.workflowName} · v{option.version} · {option.contentHash.slice(0, 8)}{option.workflowId === currentWorkflowId ? " · 当前 Workflow" : ""}</option>)}
      </select></label>
      {workflowReferences.state === "error" ? <div className="sop-valid-item err">版本目录读取失败：{workflowReferences.message}</div> : null}
      <div className="sop-reference-identity"><span>workflowId</span><code>{node.config.workflowId || "未选择"}</code><span>versionId</span><code>{node.config.versionId || "未选择"}</code><span>contentHash</span><code>{node.config.contentHash || "未选择"}</code></div>
      <div className="sop-dependency-precheck"><strong>依赖预检</strong><span>发布时解析间接递归与固定依赖链，最大嵌套深度为 5。</span>{issues.length === 0 ? <div className="sop-valid-item ok">当前固定版本引用通过编辑阶段预检。</div> : issues.map((issue) => <div key={issue.message} className={`sop-valid-item ${issue.severity === "error" ? "err" : "warn"}`}>{issue.message}</div>)}{dependencyDiagnostics.map((item) => <div key={`${item.code}-${item.message}`} className={`sop-valid-item ${item.severity === "error" ? "err" : "warn"}`}>{item.message}</div>)}</div>
    </>
  );
}
