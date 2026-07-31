import { Plus, Trash2 } from "lucide-react";
import type { WorkflowDataType } from "@orbit/workflow-core";
import type { NodeConfigInspectorProps } from "../types";
import { StageECapabilityNotice } from "../stage-e/StageEContractInspector";
import { TypedValueOrVariableInput } from "../shared/TypedValueOrVariableInput";
import { appendLoopVariable, defaultLoopVariableValue } from "./loop-config";

const dataTypes: WorkflowDataType[] = ["string", "number", "integer", "boolean", "object", "array", "any"];

/** Loop 条件、硬限制和类型化初始变量编辑器。 */
export function LoopInspector({ node, onChange, availableVariables }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "loop") return null;
  const updateConfig = (config: typeof node.config) => onChange({ ...node, config });
  return (
    <>
      <StageECapabilityNotice type={node.type} />
      <label className="sop-field"><span>循环模式</span><select value={node.config.mode} onChange={(event) => updateConfig({ ...node.config, mode: event.target.value as typeof node.config.mode })}><option value="while">while · 条件为真继续</option><option value="until">until · 条件为真停止</option></select></label>
      <label className="sop-field"><span>终止表达式</span><input value={node.config.condition} onChange={(event) => updateConfig({ ...node.config, condition: event.target.value })} /></label>
      <div className="sop-variable-scope-card"><strong>内部类型化变量</strong><span><code>iteration</code> · integer</span>{node.config.initialVariables.map((variable) => <span key={variable.id}><code>{variable.name}</code> · {variable.dataType}</span>)}</div>
      <div className="sop-field-group-title">初始变量</div>
      {node.config.initialVariables.map((variable, index) => <div className="sop-loop-variable-card" key={variable.id}>
        <div className="sop-loop-variable-head"><code>{variable.id}</code><button type="button" aria-label={`删除变量 ${variable.name}`} onClick={() => updateConfig({ ...node.config, initialVariables: node.config.initialVariables.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 aria-hidden="true" /></button></div>
        <div className="sop-inline-fields sop-loop-variable-fields"><input value={variable.name} onChange={(event) => updateConfig({ ...node.config, initialVariables: node.config.initialVariables.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} /><select value={variable.dataType} onChange={(event) => { const dataType = event.target.value as WorkflowDataType; updateConfig({ ...node.config, initialVariables: node.config.initialVariables.map((item, itemIndex) => itemIndex === index ? { ...item, dataType, value: item.value.kind === "literal" ? { kind: "literal", value: defaultLoopVariableValue(dataType) } : item.value } : item) }); }}>{dataTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
        <TypedValueOrVariableInput label="初始值" value={variable.value} dataType={variable.dataType} variables={availableVariables} onChange={(value) => updateConfig({ ...node.config, initialVariables: node.config.initialVariables.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item) })} />
      </div>)}
      <button type="button" className="btn btn-ghost btn-sm sop-add-config" onClick={() => updateConfig(appendLoopVariable(node.config))}><Plus aria-hidden="true" />添加初始变量</button>
      <label className="sop-field"><span>最大循环次数</span><input type="number" min={1} max={1000} value={node.config.maxIterations} onChange={(event) => updateConfig({ ...node.config, maxIterations: Math.min(1000, Math.max(1, Number(event.target.value) || 1)) })} /></label>
      <label className="sop-field"><span>最长运行时间（ms）</span><input type="number" min={1} max={86400000} value={node.config.timeoutMs} onChange={(event) => updateConfig({ ...node.config, timeoutMs: Math.min(86400000, Math.max(1, Number(event.target.value) || 1)) })} /></label>
    </>
  );
}
