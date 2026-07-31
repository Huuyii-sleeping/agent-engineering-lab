import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { NodeConfigInspectorProps } from "../types";
import { StageECapabilityNotice } from "../stage-e/StageEContractInspector";
import { TypedValueOrVariableInput } from "../shared/TypedValueOrVariableInput";
import { appendApprovalDisplayField, clampApprovalDeadlineMs } from "./approval-config";

/** Human Approval 策略、展示字段、决策 schema、期限和超时策略编辑器。 */
export function HumanApprovalInspector({ node, onChange, availableVariables }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "human-approval") return null;
  const [schemaText, setSchemaText] = useState(() => JSON.stringify(node.config.decisionSchema, null, 2));
  const [schemaError, setSchemaError] = useState<string | null>(null);
  useEffect(() => {
    setSchemaText(JSON.stringify(node.config.decisionSchema, null, 2));
    setSchemaError(null);
  }, [node.id]);
  const updateConfig = (config: typeof node.config) => onChange({ ...node, config });
  return (
    <>
      <StageECapabilityNotice type={node.type} />
      <label className="sop-field"><span>审批策略 ID</span><input value={node.config.policyId} placeholder="policy-finance-review" onChange={(event) => updateConfig({ ...node.config, policyId: event.target.value })} /></label>
      <div className="sop-field-group-title">审批展示字段</div>
      {node.config.displayFields.map((field, index) => <div className="sop-approval-field-card" key={field.id}>
        <div className="sop-loop-variable-head"><code>{field.id}</code><button type="button" aria-label={`删除展示字段 ${field.label}`} onClick={() => updateConfig({ ...node.config, displayFields: node.config.displayFields.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 aria-hidden="true" /></button></div>
        <label className="sop-field"><span>展示标签</span><input value={field.label} onChange={(event) => updateConfig({ ...node.config, displayFields: node.config.displayFields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></label>
        <TypedValueOrVariableInput label="展示值" value={field.value} dataType="any" variables={availableVariables} onChange={(value) => updateConfig({ ...node.config, displayFields: node.config.displayFields.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item) })} />
      </div>)}
      <button type="button" className="btn btn-ghost btn-sm sop-add-config" onClick={() => updateConfig(appendApprovalDisplayField(node.config))}><Plus aria-hidden="true" />添加展示字段</button>
      <label className="sop-field"><span>Decision JSON Schema</span><textarea rows={7} value={schemaText} onChange={(event) => {
        const next = event.target.value;
        setSchemaText(next);
        try {
          const parsed = JSON.parse(next) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("Decision schema 必须是 JSON 对象。");
          updateConfig({ ...node.config, decisionSchema: parsed as Record<string, unknown> });
          setSchemaError(null);
        } catch (error) {
          setSchemaError(error instanceof Error ? error.message : String(error));
        }
      }} /></label>
      {schemaError ? <div className="sop-valid-item err">{schemaError}</div> : null}
      <label className="sop-field"><span>审批期限（ms，最长 30 天）</span><input type="number" min={1} max={2592000000} value={node.config.deadlineMs} onChange={(event) => updateConfig({ ...node.config, deadlineMs: clampApprovalDeadlineMs(Number(event.target.value)) })} /></label>
      <div className="sop-info-row"><span className="sop-info-label">约合</span><span className="sop-info-val">{(node.config.deadlineMs / 86400000).toFixed(2)} 天</span></div>
      <label className="sop-field"><span>超时策略</span><select value={node.config.timeoutPolicy} onChange={(event) => updateConfig({ ...node.config, timeoutPolicy: event.target.value as typeof node.config.timeoutPolicy })}><option value="reject">自动拒绝</option><option value="fail">Workflow 失败</option><option value="error-route">进入 error route</option></select></label>
      <div className="sop-valid-item warn">运行时只暴露脱敏展示数据；resume token、用户凭据与历史决定不会写入 Workflow 定义。</div>
    </>
  );
}
