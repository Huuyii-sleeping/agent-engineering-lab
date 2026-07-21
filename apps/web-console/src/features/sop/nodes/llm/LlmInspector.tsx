import type { NodeConfigInspectorProps } from "../types";
import { ValueOrVariableInput } from "../shared/ValueOrVariableInput";

/** LLM 节点模型和 Prompt 面板。 */
export function LlmInspector({ node, onChange, availableVariables }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "llm") return null;
  return (
    <>
      <div className="sop-field-group-title">LLM 参数</div>
      <label className="sop-field"><span>模型</span><input value={node.config.model} onChange={(event) => onChange({ ...node, config: { ...node.config, model: event.target.value } })} /></label>
      <label className="sop-field"><span>Temperature</span><input type="number" min={0} max={2} step={0.1} value={node.config.temperature ?? 0.7} onChange={(event) => onChange({ ...node, config: { ...node.config, temperature: Number(event.target.value) } })} /></label>
      <label className="sop-field"><span>System Prompt</span><textarea rows={3} value={node.config.systemPrompt ?? ""} onChange={(event) => onChange({ ...node, config: { ...node.config, systemPrompt: event.target.value } })} /></label>
      <ValueOrVariableInput label="Prompt" value={node.config.prompt} variables={availableVariables} multiline onChange={(prompt) => onChange({ ...node, config: { ...node.config, prompt } })} />
    </>
  );
}
