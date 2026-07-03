import { ArrowLeft, BrainCircuit, Check, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { toggleAgentBuilderId } from "../../../agent-builder";
import type { AgentProfile, AgentProfileInput, AgentSkillBinding, SkillRegistryItem } from "../../../api";
import { AgentAvatar } from "../components/AgentAvatar";
import { agentAvatarOptions } from "../lib/agent-avatar";

function skillBindingFromRegistryItem(skill: SkillRegistryItem): AgentSkillBinding {
  return {
    skillId: skill.id,
    version: skill.installedVersion || skill.version,
    sourceType: skill.sourceType,
    registrySource: skill.registrySource,
  };
}

function installedSkillVersion(skill: SkillRegistryItem): string {
  return skill.installedVersion || skill.version;
}

function bindingStatus(
  skill: SkillRegistryItem,
  binding: AgentSkillBinding | undefined,
): { label: string; tone: "ok" | "warning" } {
  const lockedVersion = installedSkillVersion(skill);
  if (!binding || !binding.version) {
    return { label: "版本缺失，保存后会锁定当前版本", tone: "warning" };
  }
  if (binding.version !== lockedVersion) {
    return { label: `版本漂移：当前已安装 v${lockedVersion}`, tone: "warning" };
  }
  if (binding.sourceType !== skill.sourceType || binding.registrySource !== skill.registrySource) {
    return { label: "来源漂移，保存后会同步当前来源", tone: "warning" };
  }
  return { label: "绑定正常", tone: "ok" };
}

export function AgentConfigPage({
  activeAgent,
  draft,
  error,
  isNewDraft,
  saving,
  installedSkills,
  onBack,
  onDeleteAgent,
  onDiscardDraft,
  onDraftChange,
  onSaveAgent,
  onTestAgent,
}: {
  activeAgent: AgentProfile | null;
  draft: AgentProfileInput;
  error: string | null;
  isNewDraft: boolean;
  saving: boolean;
  installedSkills: SkillRegistryItem[];
  onBack: () => void;
  onDeleteAgent: (agent: AgentProfile) => void;
  onDiscardDraft: () => void;
  onDraftChange: (draft: AgentProfileInput) => void;
  onSaveAgent: () => void;
  onTestAgent: (agent: AgentProfile) => void;
}) {
  const selectedSkillSet = new Set(draft.skillIds);
  const installedSkillById = new Map(installedSkills.map((skill) => [skill.id, skill]));
  const bindingById = new Map(draft.skills.map((skill) => [skill.skillId, skill]));
  const selectedInstalledSkillCount = installedSkills.filter((skill) => selectedSkillSet.has(skill.id)).length;
  const unavailableBindings = draft.skills.filter((binding) => !installedSkillById.has(binding.skillId));

  function toggleSkill(skillId: string): void {
    const nextSkillIds = toggleAgentBuilderId(
      draft.skillIds,
      skillId,
      installedSkills.map((skill) => skill.id),
    );
    onDraftChange({
      ...draft,
      skillIds: nextSkillIds,
      skills: installedSkills
        .filter((skill) => nextSkillIds.includes(skill.id))
        .map((skill) => skillBindingFromRegistryItem(skill)),
    });
  }

  function updateAction(index: number, value: string): void {
    onDraftChange({
      ...draft,
      actions: draft.actions.map((action, actionIndex) => (actionIndex === index ? value : action)),
    });
  }

  function removeAction(index: number): void {
    onDraftChange({ ...draft, actions: draft.actions.filter((_, actionIndex) => actionIndex !== index) });
  }

  function addAction(): void {
    onDraftChange({ ...draft, actions: [...draft.actions, "新的自定义操作"] });
  }

  return (
    <main className="agent-config-shell">
      <header className="agent-config-header">
        <button className="agent-secondary-action" type="button" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
          <span>{isNewDraft ? "丢弃并返回" : "返回草稿库"}</span>
        </button>
        <div className="agent-config-title">
          <span>Agent configuration</span>
          <div className="agent-config-title-row">
            {activeAgent || isNewDraft ? <AgentAvatar avatarId={draft.avatarId} label={draft.name} /> : null}
            <h1>{activeAgent || isNewDraft ? draft.name : "Agent 配置"}</h1>
          </div>
          <p>
            {isNewDraft
              ? "未保存。保存后进入草稿库。"
              : activeAgent
                ? "编辑身份、技能、动作和提示词。"
                : "先选择一个草稿。"}
          </p>
        </div>
        {activeAgent || isNewDraft ? (
          <div className="agent-config-actions">
            {activeAgent ? (
              <button className="agent-danger-action" type="button" onClick={() => onDeleteAgent(activeAgent)} disabled={saving}>
                <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
                <span>删除</span>
              </button>
            ) : (
              <button className="agent-danger-action" type="button" onClick={onDiscardDraft} disabled={saving}>
                <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
                <span>丢弃草稿</span>
              </button>
            )}
            <button className="agent-secondary-action" type="button" onClick={onSaveAgent} disabled={saving}>
              <Check size={16} strokeWidth={2.4} aria-hidden="true" />
              <span>{saving ? "保存中" : "保存"}</span>
            </button>
            {activeAgent ? (
              <button className="agent-primary-action" type="button" onClick={() => onTestAgent(activeAgent)} disabled={saving}>
                <MessageSquare size={16} strokeWidth={2.2} aria-hidden="true" />
                <span>使用 / 测试</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="agent-error-banner" role="alert">
          <strong>Agent 草稿操作失败</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {activeAgent || isNewDraft ? (
        <section className="agent-config-layout" aria-label="Agent 配置工作台">
          <section className="agent-config-main" aria-label="Agent 基础信息">
            <div className="agent-config-panel-heading">
              <span>Identity</span>
              <strong>基础信息</strong>
            </div>
            <div className="agent-editor-form">
              <div className="agent-field agent-avatar-field">
                <span>Agent 头像</span>
                <div className="agent-avatar-picker" role="group" aria-label="选择内置 Agent 头像">
                  {agentAvatarOptions.map((option) => (
                    <button
                      className={`agent-avatar-option ${draft.avatarId === option.id ? "agent-avatar-option--selected" : ""}`}
                      key={option.id}
                      type="button"
                      aria-pressed={draft.avatarId === option.id}
                      onClick={() => onDraftChange({ ...draft, avatarId: option.id })}
                    >
                      <AgentAvatar avatarId={option.id} label={option.label} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                  <button className="agent-avatar-option agent-avatar-option--upload" type="button" disabled>
                    <span className="agent-avatar agent-avatar--upload" aria-hidden="true">
                      <Plus size={19} strokeWidth={2.4} />
                    </span>
                    <span>上传</span>
                  </button>
                </div>
              </div>
              <label className="agent-field">
                <span>Agent 名称</span>
                <input
                  maxLength={36}
                  value={draft.name}
                  onChange={(event) => onDraftChange({ ...draft, name: event.currentTarget.value })}
                />
              </label>
              <label className="agent-field">
                <span>描述</span>
                <input
                  maxLength={140}
                  value={draft.description}
                  onChange={(event) => onDraftChange({ ...draft, description: event.currentTarget.value })}
                />
              </label>
              <label className="agent-field">
                <span>适用场景</span>
                <textarea
                  maxLength={180}
                  rows={3}
                  value={draft.scenario}
                  onChange={(event) => onDraftChange({ ...draft, scenario: event.currentTarget.value })}
                />
              </label>
              <label className="agent-field agent-field--prompt">
                <span>System prompt / 个性化说明</span>
                <textarea
                  maxLength={1600}
                  rows={8}
                  value={draft.systemPrompt}
                  onChange={(event) => onDraftChange({ ...draft, systemPrompt: event.currentTarget.value })}
                />
              </label>
            </div>
          </section>

          <aside className="agent-config-side" aria-label="Agent 能力配置">
            <div className="agent-config-panel-heading">
              <span>Skills</span>
              <strong>{selectedInstalledSkillCount} 已选</strong>
            </div>
            <div className="agent-skill-list">
              {installedSkills.length === 0 ? (
                <span className="agent-muted-text">没有已安装的 Skill。请先到 Skill Hub 下载并安装。</span>
              ) : null}
              {installedSkills.map((skill) => {
                const selected = selectedSkillSet.has(skill.id);
                const lockedVersion = installedSkillVersion(skill);
                const status = selected ? bindingStatus(skill, bindingById.get(skill.id)) : null;
                return (
                  <button
                    className={`agent-skill-item ${selected ? "agent-skill-item--selected" : ""}`}
                    key={skill.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleSkill(skill.id)}
                  >
                    <span>
                      <strong>{skill.name}</strong>
                      <small>
                        {skill.category} · {skill.provider} · 锁定 v{lockedVersion}
                      </small>
                      {status ? (
                        <small className={`agent-skill-binding-status agent-skill-binding-status--${status.tone}`}>
                          {status.label}
                        </small>
                      ) : null}
                    </span>
                    <span className="agent-skill-check">
                      {selected ? (
                        <Check size={14} strokeWidth={2.7} aria-hidden="true" />
                      ) : (
                        <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                      )}
                    </span>
                  </button>
                );
              })}
              {unavailableBindings.map((binding) => (
                <div className="agent-skill-item agent-skill-item--stale" key={binding.skillId}>
                  <span>
                    <strong>{binding.skillId}</strong>
                    <small>已卸载 · 原锁定 v{binding.version || "未知"}</small>
                    <small className="agent-skill-binding-status agent-skill-binding-status--warning">
                      保存前请重新安装或移除该绑定
                    </small>
                  </span>
                  <span className="agent-skill-check">
                    <X size={14} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                </div>
              ))}
            </div>

            <div className="agent-config-panel-heading agent-config-panel-heading--actions">
              <span>Custom actions</span>
              <button className="agent-mini-action" type="button" onClick={addAction}>
                <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
                <span>添加</span>
              </button>
            </div>
            <div className="agent-action-list">
              {draft.actions.length === 0 ? (
                <span className="agent-muted-text">尚未配置自定义操作。</span>
              ) : (
                draft.actions.map((action, index) => (
                  <label className="agent-action-row" key={index}>
                    <input value={action} maxLength={80} onChange={(event) => updateAction(index, event.currentTarget.value)} />
                    <button type="button" aria-label="移除操作" onClick={() => removeAction(index)}>
                      <X size={15} strokeWidth={2.3} aria-hidden="true" />
                    </button>
                  </label>
                ))
              )}
            </div>
          </aside>
        </section>
      ) : (
        <section className="agent-config-empty">
          <BrainCircuit size={30} strokeWidth={2.2} aria-hidden="true" />
          <strong>没有选中的 agent</strong>
          <span>返回草稿库后选择一个 agent。</span>
        </section>
      )}
    </main>
  );
}
