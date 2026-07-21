import type { NodeConfigInspectorProps } from "../types";
import { ValueOrVariableInput } from "../shared/ValueOrVariableInput";

/** Knowledge 节点知识库和召回数量面板。 */
export function KnowledgeInspector({ node, onChange, availableVariables }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "knowledge") return null;
  return (
    <>
      <label className="sop-field"><span>知识库 ID</span><input value={node.config.knowledgeBaseId} onChange={(event) => onChange({ ...node, config: { ...node.config, knowledgeBaseId: event.target.value } })} /></label>
      <ValueOrVariableInput label="查询" value={node.config.query} variables={availableVariables} onChange={(query) => onChange({ ...node, config: { ...node.config, query } })} />
      <label className="sop-field"><span>Top K</span><input type="number" min={1} max={50} value={node.config.topK} onChange={(event) => onChange({ ...node, config: { ...node.config, topK: Number(event.target.value) } })} /></label>
    </>
  );
}
