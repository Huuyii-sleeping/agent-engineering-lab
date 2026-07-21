import type { NodeConfigInspectorProps } from "../types";
import { ValueOrVariableInput } from "../shared/ValueOrVariableInput";

/** HTTP 节点基础请求面板。 */
export function HttpInspector({ node, onChange, availableVariables }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "http") return null;
  return (
    <>
      <label className="sop-field"><span>方法</span><select value={node.config.method} onChange={(event) => onChange({ ...node, config: { ...node.config, method: event.target.value as typeof node.config.method } })}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => <option key={method}>{method}</option>)}</select></label>
      <ValueOrVariableInput label="URL" value={node.config.url} variables={availableVariables} onChange={(url) => onChange({ ...node, config: { ...node.config, url } })} />
      <label className="sop-field"><span>Credential ID</span><input value={node.config.credential?.credentialId ?? ""} onChange={(event) => onChange({ ...node, config: { ...node.config, credential: event.target.value ? { credentialId: event.target.value, capability: "http:request" } : undefined } })} /></label>
      <label className="sop-field"><span>请求体</span><textarea rows={3} value={node.config.body?.kind === "literal" ? JSON.stringify(node.config.body.value, null, 2) : ""} onChange={(event) => onChange({ ...node, config: { ...node.config, body: { kind: "literal", value: event.target.value } } })} /></label>
      <label className="sop-field"><span>超时（ms）</span><input type="number" min={1000} value={node.config.timeoutMs} onChange={(event) => onChange({ ...node, config: { ...node.config, timeoutMs: Number(event.target.value) } })} /></label>
    </>
  );
}
