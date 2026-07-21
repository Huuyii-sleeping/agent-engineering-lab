import type { NodeConfigInspectorProps } from "../types";

/** Code 节点语言和源码面板。 */
export function CodeInspector({ node, onChange }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "code") return null;
  return (
    <>
      <label className="sop-field"><span>语言</span><select value={node.config.language} onChange={(event) => onChange({ ...node, config: { ...node.config, language: event.target.value as typeof node.config.language } })}><option value="javascript">JavaScript</option><option value="python">Python</option></select></label>
      <label className="sop-field"><span>代码</span><textarea rows={8} value={node.config.source} onChange={(event) => onChange({ ...node, config: { ...node.config, source: event.target.value } })} /></label>
      <div className="sop-info-row"><span className="sop-info-label">输入绑定</span><span className="sop-info-val">{Object.keys(node.config.inputs).length} 个</span></div>
    </>
  );
}
