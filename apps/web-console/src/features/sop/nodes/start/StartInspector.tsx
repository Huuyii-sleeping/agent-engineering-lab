import { builtinNodeRegistry, type WorkflowDataType } from "@orbit/workflow-core";
import type { NodeConfigInspectorProps } from "../types";

/** Start 节点输入声明面板。 */
export function StartInspector({ node, onChange }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "start") return null;
  return (
    <>
      <div className="sop-field-group-title">工作流输入</div>
      {node.config.inputs.map((field, index) => <div className="sop-inline-fields" key={field.id}><input value={field.name} onChange={(event) => { const inputs = node.config.inputs.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item); const config = { inputs }; onChange({ ...node, config, ports: builtinNodeRegistry.get("start")!.createPorts(config) }); }} /><select value={field.dataType} onChange={(event) => { const inputs = node.config.inputs.map((item, itemIndex) => itemIndex === index ? { ...item, dataType: event.target.value as WorkflowDataType } : item); const config = { inputs }; onChange({ ...node, config, ports: builtinNodeRegistry.get("start")!.createPorts(config) }); }}>{["string", "number", "boolean", "object", "array"].map((type) => <option key={type}>{type}</option>)}</select><button type="button" onClick={() => { const config = { inputs: node.config.inputs.filter((_, itemIndex) => itemIndex !== index) }; onChange({ ...node, config, ports: builtinNodeRegistry.get("start")!.createPorts(config) }); }}>×</button></div>)}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
        const id = `input-${node.config.inputs.length + 1}`;
        const config = { ...node.config, inputs: [...node.config.inputs, { id, name: `输入 ${node.config.inputs.length + 1}`, dataType: "string" as const }] };
        onChange({ ...node, config, ports: builtinNodeRegistry.get("start")!.createPorts(config) });
      }}>添加输入字段</button>
    </>
  );
}
