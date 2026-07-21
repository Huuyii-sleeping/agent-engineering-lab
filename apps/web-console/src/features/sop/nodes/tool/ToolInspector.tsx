import type { NodeConfigInspectorProps } from "../types";

/** Tool 节点工具 identity 面板。 */
export function ToolInspector({ node, onChange, availableVariables }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "tool") return null;
  const firstVariable = availableVariables[0];
  return <><label className="sop-field"><span>工具 ID</span><input value={node.config.toolId} placeholder="web_search / code_runner" onChange={(event) => onChange({ ...node, config: { ...node.config, toolId: event.target.value } })} /></label><label className="sop-field"><span>参数名</span><input placeholder="query" onBlur={(event) => { const key = event.target.value.trim(); if (key && firstVariable) onChange({ ...node, config: { ...node.config, arguments: { ...node.config.arguments, [key]: { kind: "variable", ref: firstVariable.ref } } } }); }} /></label><div className="sop-info-row"><span className="sop-info-label">已绑定参数</span><span className="sop-info-val">{Object.keys(node.config.arguments).length}</span></div></>;
}
