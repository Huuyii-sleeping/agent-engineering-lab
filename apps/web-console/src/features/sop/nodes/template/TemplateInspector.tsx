import type { NodeConfigInspectorProps } from "../types";

/** Template 节点模板文本面板。 */
export function TemplateInspector({ node, onChange, availableVariables }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "template") return null;
  return <><label className="sop-field"><span>模板</span><textarea rows={6} value={node.config.template} placeholder="请输入模板内容" onChange={(event) => onChange({ ...node, config: { ...node.config, template: event.target.value } })} /></label><label className="sop-field"><span>插入变量</span><select value="" onChange={(event) => { const variable = availableVariables.find((item) => item.id === event.target.value); if (variable) onChange({ ...node, config: { ...node.config, template: `${node.config.template}{{${variable.label}}}`, variables: { ...node.config.variables, [variable.label]: { kind: "variable", ref: variable.ref } } } }); }}><option value="">选择变量…</option>{availableVariables.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></>;
}
