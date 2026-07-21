import type { NodeConfigInspectorProps } from "../types";

/** End 节点输出收集面板。 */
export function EndInspector({ node, onChange, availableVariables }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "end") return null;
  return <><div className="sop-field-group-title">工作流输出</div>{node.config.outputs.map((output, index) => <div className="sop-field" key={output.id}><input value={output.name} onChange={(event) => onChange({ ...node, config: { outputs: node.config.outputs.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) } })} /><select value={availableVariables.find((item) => JSON.stringify(item.ref) === JSON.stringify(output.value))?.id ?? ""} onChange={(event) => { const variable = availableVariables.find((item) => item.id === event.target.value); if (variable) onChange({ ...node, config: { outputs: node.config.outputs.map((item, itemIndex) => itemIndex === index ? { ...item, value: variable.ref } : item) } }); }}><option value="">选择输出变量</option>{availableVariables.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>)}<button type="button" className="btn btn-ghost btn-sm" onClick={() => { const index = node.config.outputs.length + 1; onChange({ ...node, config: { outputs: [...node.config.outputs, { id: `output-${index}`, name: `输出 ${index}` }] } }); }}>添加输出</button></>;
}
