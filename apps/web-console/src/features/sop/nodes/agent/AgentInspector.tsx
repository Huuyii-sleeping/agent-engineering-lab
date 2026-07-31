import { Plus, RefreshCw, Trash2 } from "lucide-react";
import type { NodeConfigInspectorProps } from "../types";
import { StageECapabilityNotice } from "../stage-e/StageEContractInspector";
import { TypedValueOrVariableInput } from "../shared/TypedValueOrVariableInput";
import { addAgentInputBinding, applyAgentVersion, removeAgentInputBinding, renameAgentInputBinding } from "./agent-config";

/** Agent 不可变版本、输入绑定、输出契约和 Memory 隔离检查器。 */
export function AgentInspector({ node, onChange, agentReferences, availableVariables, diagnostics }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "agent") return null;
  const updateConfig = (config: typeof node.config) => onChange({ ...node, config });
  const selected = agentReferences.options.find((version) => version.id === node.config.agentVersionId && version.agentProfileId === node.config.agentProfileId);
  const selectedExists = Boolean(selected);
  const agentDiagnostics = diagnostics.filter((item) => /agent/i.test(`${item.code} ${item.message}`));
  return (
    <>
      <StageECapabilityNotice type={node.type} />
      <div className="sop-reference-heading">
        <div className="sop-field-group-title">固定 AgentVersion</div>
        <button type="button" aria-label="刷新 Agent 版本" onClick={agentReferences.refresh}><RefreshCw aria-hidden="true" /></button>
      </div>
      <label className="sop-field">
        <span>Agent / Version</span>
        <select value={node.config.agentVersionId} disabled={agentReferences.state === "loading"} onChange={(event) => {
          const version = agentReferences.options.find((candidate) => candidate.id === event.target.value);
          if (version) updateConfig(applyAgentVersion(node.config, version));
        }}>
          <option value="">{agentReferences.state === "loading" ? "正在读取发布版本…" : "选择不可变发布版本"}</option>
          {!selectedExists && node.config.agentVersionId ? <option value={node.config.agentVersionId}>当前引用不可用 · {node.config.agentVersionId}</option> : null}
          {agentReferences.options.map((version) => <option key={version.id} value={version.id}>{version.name} · v{version.version} · {version.contentHash.slice(0, 8)}</option>)}
        </select>
      </label>
      {agentReferences.state === "error" ? <div className="sop-valid-item err">AgentVersion 目录读取失败：{agentReferences.message}</div> : null}
      <div className="sop-reference-identity">
        <span>profileId</span><code>{node.config.agentProfileId || "未选择"}</code>
        <span>versionId</span><code>{node.config.agentVersionId || "未选择"}</code>
        <span>contentHash</span><code>{selected?.contentHash ?? "未解析"}</code>
      </div>
      {selected ? <div className="sop-agent-version-card">
        <strong>{selected.name} · v{selected.version}</strong>
        <span>{selected.description || "无版本说明"}</span>
        <span>Instructions：{selected.instructions.join(" / ") || "无"}</span>
        <span>Skills：{selected.skillPolicy.bindings.map((binding) => `${binding.skillId}@${binding.version || "locked"}`).join("、") || "无"}</span>
        <span>Tools：{selected.toolPolicy.allowedToolIds.join("、") || "关闭（未显式发布）"}</span>
      </div> : null}

      <div className="sop-reference-heading">
        <div className="sop-field-group-title">输入绑定</div>
        <button type="button" aria-label="新增 Agent 输入" onClick={() => updateConfig(addAgentInputBinding(node.config))}><Plus aria-hidden="true" /></button>
      </div>
      {Object.entries(node.config.inputBindings).length === 0 ? <div className="sop-valid-item warn">尚未配置输入；运行时不会隐式读取其他节点变量。</div> : null}
      {Object.entries(node.config.inputBindings).map(([name, value]) => <div key={name} className="sop-agent-binding-card">
        <div className="sop-agent-binding-name">
          <input aria-label="Agent 输入名称" defaultValue={name} onBlur={(event) => updateConfig(renameAgentInputBinding(node.config, name, event.target.value))} />
          <button type="button" aria-label={`删除 Agent 输入 ${name}`} onClick={() => updateConfig(removeAgentInputBinding(node.config, name))}><Trash2 aria-hidden="true" /></button>
        </div>
        <TypedValueOrVariableInput label="值" value={value} dataType="any" variables={availableVariables} onChange={(next) => updateConfig({ ...node.config, inputBindings: { ...node.config.inputBindings, [name]: next } })} />
      </div>)}

      <label className="sop-field"><span>版本输出 schema（只读）</span><textarea rows={7} readOnly value={JSON.stringify(node.config.outputSchema, null, 2)} /></label>
      <div className="sop-variable-scope-card"><strong>Memory 隔离</strong><span><code>isolation=node-run</code></span><span><code>shareThread=false</code></span><span>每个父 run + node instance 使用独立 session/thread，不共享用户对话或其他节点 Memory。</span></div>
      {agentDiagnostics.map((item) => <div key={`${item.code}-${item.message}`} className={`sop-valid-item ${item.severity === "error" ? "err" : "warn"}`}>{item.message}</div>)}
    </>
  );
}
