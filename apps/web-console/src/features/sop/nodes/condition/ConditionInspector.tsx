import { builtinNodeRegistry } from "@orbit/workflow-core";
import type { NodeConfigInspectorProps } from "../types";

/** Condition 节点表达式与分支面板。 */
export function ConditionInspector({ node, onChange }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "condition") return null;
  return <><label className="sop-field"><span>表达式</span><input value={node.config.expression} placeholder="score >= 60" onChange={(event) => {
    const config = { ...node.config, expression: event.target.value };
    onChange({ ...node, config, ports: builtinNodeRegistry.get("condition")!.createPorts(config) });
  }} /></label>{node.config.cases.map((item, index) => <div className="sop-inline-fields" key={item.id}><input value={item.label} onChange={(event) => { const config = { ...node.config, cases: node.config.cases.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, label: event.target.value } : candidate) }; onChange({ ...node, config, ports: builtinNodeRegistry.get("condition")!.createPorts(config) }); }} /><input value={item.expression} onChange={(event) => { const config = { ...node.config, cases: node.config.cases.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, expression: event.target.value } : candidate) }; onChange({ ...node, config, ports: builtinNodeRegistry.get("condition")!.createPorts(config) }); }} /></div>)}</>;
}
