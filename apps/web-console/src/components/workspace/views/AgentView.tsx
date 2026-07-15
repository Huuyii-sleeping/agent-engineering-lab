import { Bot, Check, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type { AgentProfile, AgentProfileInput, AgentSkillPreflightResult, SkillRegistryItem } from "../../../api";

function skillBindingFromRegistryItem(skill: SkillRegistryItem) {
  return {
    skillId: skill.id,
    version: skill.installedVersion || skill.version,
    sourceType: skill.sourceType,
    registrySource: skill.registrySource,
  };
}

export function AgentView({
  active,
  agents,
  activeAgentId,
  onSelectAgent,
  draft,
  activeAgent,
  isNewDraft,
  error,
  saving,
  installedSkills,
  skillPreflight,
  skillPreflightLoading,
  onDraftChange,
  onResolveAgentSkills,
  onSaveAgent,
  onDiscardDraft,
  onDeleteAgent,
  onNewAgent,
  onRefresh,
}: {
  active: boolean;
  agents: AgentProfile[];
  activeAgentId: string | null;
  onSelectAgent: (agent: AgentProfile) => void;
  draft: AgentProfileInput;
  activeAgent: AgentProfile | null;
  isNewDraft: boolean;
  error: string | null;
  saving: boolean;
  installedSkills: SkillRegistryItem[];
  skillPreflight: AgentSkillPreflightResult | null;
  skillPreflightLoading: boolean;
  onDraftChange: (draft: AgentProfileInput) => void;
  onResolveAgentSkills: () => void;
  onSaveAgent: () => void;
  onDiscardDraft: () => void;
  onDeleteAgent: (agent: AgentProfile) => void;
  onNewAgent: () => void;
  onRefresh: () => void;
}) {
  const selectedSkillSet = new Set(draft.skillIds);
  const runtimeOk = skillPreflight?.ok ?? false;
  const runtimeTone = skillPreflightLoading ? "warning" : runtimeOk ? "ok" : "warning";

  function toggleSkill(skillId: string): void {
    const nextSkillIds = selectedSkillSet.has(skillId)
      ? draft.skillIds.filter((id) => id !== skillId)
      : [...draft.skillIds, skillId];
    onDraftChange({
      ...draft,
      skillIds: nextSkillIds,
      skills: installedSkills.filter((skill) => nextSkillIds.includes(skill.id)).map(skillBindingFromRegistryItem),
    });
  }

  function updateAction(index: number, value: string): void {
    onDraftChange({ ...draft, actions: draft.actions.map((action, i) => (i === index ? value : action)) });
  }

  function removeAction(index: number): void {
    onDraftChange({ ...draft, actions: draft.actions.filter((_, i) => i !== index) });
  }

  function addAction(): void {
    onDraftChange({ ...draft, actions: [...draft.actions, "新的自定义操作"] });
  }

  return (
    <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="agent">
      <div className="section-head">
        <span className="eyebrow">Agent 管理</span>
        <h2 className="h2">Agent 草稿与配置</h2>
        <p className="sub">在左侧管理草稿，选中后在右侧编辑基础信息、绑定技能并完成运行时预检（preflight）。</p>
      </div>

      <div className="two">
        <div className="list-card">
          <div className="list-h">
            <Bot aria-hidden="true" width={16} height={16} />
            草稿列表
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto", height: 28 }}
              onClick={onNewAgent}
              disabled={saving}
            >
              <Plus aria-hidden="true" /> 新建
            </button>
          </div>
          {agents.length === 0 ? (
            <div className="row-sub" style={{ padding: 16 }}>
              还没有 Agent 草稿
            </div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.id}
                className={`row ${agent.id === activeAgentId ? "on" : ""}`}
                onClick={() => onSelectAgent(agent)}
              >
                <span className="row-ic" aria-hidden="true">
                  <Bot aria-hidden="true" />
                </span>
                <div className="row-main">
                  <div className="row-name">{agent.name}</div>
                  <div className="row-sub">
                    {agent.skills.length} 项技能 · {agent.id === activeAgentId ? "已选中" : "草稿"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="config">
          {error ? (
            <div className="pill red" style={{ marginBottom: 14 }}>
              <span className="d" /> {error}
            </div>
          ) : null}

          {activeAgent || isNewDraft ? (
            <>
              <div className="config-h">
                <span className="icon-box" aria-hidden="true">
                  <Bot aria-hidden="true" />
                </span>
                <div>
                  <div className="nm">{draft.name || "未命名 Agent"}</div>
                  <span className="pill green">
                    <span className="d" /> {isNewDraft ? "草稿" : "已就绪"}
                  </span>
                </div>
              </div>

              <div className="field">
                <label>名称</label>
                <input className="input" value={draft.name} onChange={(e) => onDraftChange({ ...draft, name: e.target.value })} />
              </div>
              <div className="field">
                <label>描述</label>
                <textarea
                  className="input"
                  value={draft.description}
                  onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="field">
                <label>适用场景</label>
                <textarea
                  className="input"
                  value={draft.scenario}
                  onChange={(e) => onDraftChange({ ...draft, scenario: e.target.value })}
                />
              </div>

              <div className="field">
                <label>已绑定技能</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {installedSkills.length === 0 ? (
                    <div className="draft-sub">没有已安装技能，请先到 Skill Hub 安装。</div>
                  ) : (
                    installedSkills.map((skill) => {
                      const selected = selectedSkillSet.has(skill.id);
                      return (
                        <div
                          key={skill.id}
                          className="check"
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleSkill(skill.id)}
                          role="button"
                          aria-pressed={selected}
                        >
                          <span className="nm">{skill.name}</span>
                          {selected ? (
                            <span className="ok">
                              <span className="d" /> 已绑定
                            </span>
                          ) : (
                            <span className="warn">
                              <span className="d" /> 未绑定
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="field">
                <label>运行时预检</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="check">
                    <span className="nm">技能可解析</span>
                    <span className={runtimeOk ? "ok" : "warn"}>
                      <span className="d" /> {skillPreflightLoading ? "检查中" : runtimeOk ? "通过" : "未检查"}
                    </span>
                  </div>
                  <div className="check">
                    <span className="nm">工具权限可用</span>
                    <span className={runtimeOk ? "ok" : "warn"}>
                      <span className="d" /> {runtimeOk ? "通过" : "未知"}
                    </span>
                  </div>
                  <div className="check">
                    <span className="nm">模型可达性</span>
                    <span className={runtimeTone === "ok" ? "ok" : "warn"}>
                      <span className="d" /> 正常
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ alignSelf: "flex-start", marginTop: 4 }}
                    onClick={onResolveAgentSkills}
                    disabled={saving || skillPreflightLoading}
                  >
                    <RefreshCw aria-hidden="true" /> 运行预检
                  </button>
                </div>
              </div>

              <div className="field">
                <label>自定义动作</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {draft.actions.map((action, index) => (
                    <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        className="input"
                        style={{ flex: 1 }}
                        value={action}
                        onChange={(e) => updateAction(index, e.target.value)}
                      />
                      <button
                        type="button"
                        className="tool-btn"
                        aria-label="移除操作"
                        onClick={() => removeAction(index)}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={addAction}>
                    <Plus aria-hidden="true" /> 添加动作
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" onClick={onSaveAgent} disabled={saving}>
                  <Check aria-hidden="true" /> {saving ? "保存中" : "保存配置"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onDiscardDraft} disabled={saving}>
                  草稿
                </button>
                {activeAgent ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => onDeleteAgent(activeAgent)}
                      disabled={saving}
                    >
                      <Trash2 aria-hidden="true" /> 删除
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => onRefresh()} disabled={saving}>
                      <RefreshCw aria-hidden="true" /> 刷新
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-soft)" }}>
              <ShieldCheck aria-hidden="true" style={{ width: 30, height: 30, opacity: 0.6 }} />
              <div style={{ marginTop: 12, fontWeight: 600 }}>没有选中的 Agent</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>从左侧草稿列表选择一个 Agent，或新建一个。</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
