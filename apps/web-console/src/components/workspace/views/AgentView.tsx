import { useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  Code2,
  FileText,
  PenTool,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  BarChart3,
} from "lucide-react";
import { BrandMark } from "../../BrandMark";
import type {
  AgentProfile,
  AgentProfileInput,
  AgentSkillPreflightResult,
  SkillRegistryItem,
} from "../../../api";

function skillBindingFromRegistryItem(skill: SkillRegistryItem) {
  return {
    skillId: skill.id,
    version: skill.installedVersion || skill.version,
    sourceType: skill.sourceType,
    registrySource: skill.registrySource,
  };
}

/* ── Card personalization ─────────────────────────────────── */

/** Shared accent palette used by both the auto-hash fallback and the color picker. */
const ACCENT_PALETTE: readonly { value: string; label: string }[] = [
  { value: "#3b82f6", label: "蓝" },
  { value: "#8b5cf6", label: "紫" },
  { value: "#f59e0b", label: "琥珀" },
  { value: "#ec4899", label: "粉" },
  { value: "#06b6d4", label: "青" },
  { value: "#84cc16", label: "青柠" },
  { value: "#f43f5e", label: "玫红" },
];

/** Stable accent color derived from agent id (deterministic, no random). */
function agentAccent(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length].value;
}

/** Resolve an agent's effective accent: explicit color wins, else deterministic hash. */
function resolveAccent(color: string, id: string): string {
  return color || agentAccent(id);
}

/** Pick a lucide icon component based on scenario keywords. */
function agentSceneIcon(scenario: string): typeof Code2 {
  const s = scenario.toLowerCase();
  if (/代码|编程|技术|code|dev/i.test(s)) return Code2;
  if (/内容|写作|文案|翻译|创作|write|content/i.test(s)) return PenTool;
  if (/数据|分析|统计|报表|data|analy/i.test(s)) return BarChart3;
  if (/文档|文件|pdf|doc|file/i.test(s)) return FileText;
  return Bot;
}

/** Short label extracted from scenario text for the card tag. */
function agentSceneLabel(scenario: string, maxLen = 10): string {
  const first = scenario.split(/[,，、]/)[0].trim();
  return first.length > maxLen ? first.slice(0, maxLen) : first;
}

/** Truncate string to max length, adding ellipsis if needed. */
function ellipsis(text: string, max = 60): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
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
  // Internal navigation: grid ↔ detail
  const [detailId, setDetailId] = useState<string | null>(null);

  /** Open a specific agent's detail view. */
  function openDetail(agent: AgentProfile): void {
    setDetailId(agent.id);
    onSelectAgent(agent);
  }

  /** Return to grid. */
  function closeDetail(): void {
    setDetailId(null);
  }

  // Effective active agent: real one from props
  const effActive = activeAgent;
  // Effective accent shown in the detail header: explicit draft color, else hash of the agent id.
  const detailAccent = resolveAccent(draft.color, effActive?.id ?? "new-agent");

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
      skills: installedSkills
        .filter((skill) => nextSkillIds.includes(skill.id))
        .map(skillBindingFromRegistryItem),
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

  /* ── Grid (card list) ──────────────────────────────────────── */

  const displayAgents: AgentProfile[] = agents;

  if (!detailId && !isNewDraft) {
    return (
      <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="agent">
        <div className="section-head">
          <span className="eyebrow">Agent 草稿</span>
          <h2 className="h2">管理你的 Agent</h2>
          <p className="sub">{displayAgents.length} 个草稿 · {installedSkills.length} 个已安装技能</p>
        </div>

        <div className={`ag-grid ${displayAgents.length === 0 ? "ag-grid--center" : ""}`}>
          {displayAgents.length === 0 ? (
            <div className="ag-empty">
              <Bot aria-hidden="true" width={32} height={32} />
              <b>还没有 Agent 草稿</b>
              <span>点击右上角新建一个 Agent 开始配置。</span>
            </div>
          ) : (
            displayAgents.map((agent) => {
              const accent = resolveAccent(agent.color, agent.id);
              const SceneIcon = agentSceneIcon(agent.scenario);
              return (
                <button
                  key={agent.id}
                  type="button"
                  className="ag-card"
                  onClick={() => openDetail(agent)}
                >
                  <div className="ag-card-accent" style={{ background: accent }} aria-hidden="true" />
                  <span className="ag-card-icon" aria-hidden="true">
                    <SceneIcon width={20} height={20} />
                  </span>
                  <div className="ag-card-body">
                    <div className="ag-card-name">{agent.name}</div>
                    <div className="ag-card-desc">{ellipsis(agent.description)}</div>
                  </div>
                  <div className="ag-card-foot">
                    <span className="ag-tag" style={{ color: accent, borderColor: accent + "33", background: accent + "14" }}>
                      {agentSceneLabel(agent.scenario)}
                    </span>
                    <span className="ag-badge">{agent.skills.length} 项技能</span>
                    <ChevronRight aria-hidden="true" width={14} height={14} />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>
    );
  }

  /* ── Detail (full config) ─────────────────────────────────── */
  return (
    <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="agent">
      {/* back header */}
      <div className="ag-detail-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={closeDetail} disabled={saving}>
          <ArrowLeft aria-hidden="true" /> 返回列表
        </button>
        <div style={{ flex: 1 }} />
        {error ? (
          <span className="pill red"><span className="d" />{error}</span>
        ) : null}
        {(effActive || isNewDraft) ? (
          <span className={`pill ${isNewDraft ? "" : "green"}`}>
            <span className="d" />{isNewDraft ? "草稿" : "已就绪"}
          </span>
        ) : null}
      </div>

      {/* empty state when no agent selected */}
      {!effActive && !isNewDraft ? (
        <div className="ag-empty" style={{ marginTop: 80 }}>
          <ShieldCheck aria-hidden="true" width={36} height={36} />
          <b>没有选中的 Agent</b>
          <span>从卡片网格选择一个 Agent，或新建一个。</span>
        </div>
      ) : (
        <>
          {/* identity */}
          <div className="ag-section">
            <div className="ag-s-h">
              <span
                className="icon-box"
                aria-hidden="true"
                style={{ color: detailAccent, borderColor: detailAccent + "44", background: detailAccent + "14" }}
              >
                <Pencil aria-hidden="true" />
              </span>
              <div>
                <div className="nm">{draft.name || "未命名 Agent"}</div>
                {isNewDraft ? (
                  <span className="pill"><span className="d" />草稿</span>
                ) : (
                  <span className="pill green"><span className="d" />已就绪</span>
                )}
              </div>
            </div>
            <div className="field">
              <label>名称</label>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>描述</label>
              <textarea
                className="input"
                rows={2}
                value={draft.description}
                onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="field">
              <label>适用场景</label>
              <textarea
                className="input"
                rows={2}
                value={draft.scenario}
                onChange={(e) => onDraftChange({ ...draft, scenario: e.target.value })}
              />
            </div>
            <div className="field">
              <label>主题色</label>
              <div className="color-picker">
                <button
                  type="button"
                  className={`color-swatch color-swatch--auto ${draft.color === "" ? "is-active" : ""}`}
                  aria-pressed={draft.color === ""}
                  title="自动（按 ID 哈希分配）"
                  onClick={() => onDraftChange({ ...draft, color: "" })}
                >
                  自动
                </button>
                {ACCENT_PALETTE.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`color-swatch ${draft.color === c.value ? "is-active" : ""}`}
                    style={{ background: c.value }}
                    aria-pressed={draft.color === c.value}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => onDraftChange({ ...draft, color: c.value })}
                  >
                    {draft.color === c.value ? <Check aria-hidden="true" width={14} height={14} /> : null}
                  </button>
                ))}
              </div>
              <div className="draft-sub">选“自动”时按 Agent ID 稳定分配颜色；选定颜色后会持久化到该 Agent。</div>
            </div>
          </div>

          {/* skills */}
          <div className="ag-section">
            <div className="field">
              <label>已绑定技能</label>
              {installedSkills.length === 0 ? (
                <div className="draft-sub">没有已安装技能，请先到 Skill Hub 安装。</div>
              ) : (
                <div className="check-list">
                  {installedSkills.map((skill) => {
                    const selected = selectedSkillSet.has(skill.id);
                    return (
                      <div key={skill.id}
                        className="check"
                        role="button"
                        aria-pressed={selected}
                        onClick={() => toggleSkill(skill.id)}
                      >
                        <span className="nm">{skill.name}</span>
                        {selected ? (
                          <span className="ok"><span className="d" />可加载</span>
                        ) : (
                          <span className="warn"><span className="d" />未绑定</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* preflight */}
          <div className="ag-section">
            <div className="field">
              <label>运行时预检</label>
              <div className="check-list">
                <div className="check">
                  <span className="nm">技能可解析</span>
                  <span className={runtimeOk ? "ok" : "warn"}>
                    <span className="d" />{skillPreflightLoading ? "检查中" : runtimeOk ? "通过" : "未检查"}
                  </span>
                </div>
                <div className="check">
                  <span className="nm">工具权限可用</span>
                  <span className={runtimeOk ? "ok" : "warn"}>
                    <span className="d" />{runtimeOk ? "通过" : "未知"}
                  </span>
                </div>
                <div className="check">
                  <span className="nm">模型可达性</span>
                  <span className={runtimeTone === "ok" ? "ok" : "warn"}>
                    <span className="d" />正常
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: "flex-start", marginTop: 10 }}
                onClick={onResolveAgentSkills}
                disabled={saving || skillPreflightLoading}
              >
                <RefreshCw aria-hidden="true" /> 运行预检
              </button>
            </div>
          </div>

          {/* custom actions */}
          <div className="ag-section">
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
          </div>

          {/* system prompt */}
          <div className="ag-section">
            <div className="field">
              <label>系统提示</label>
              <textarea
                className="input"
                rows={6}
                style={{ fontFamily: "var(--ff-mono)", fontSize: 12.5 }}
                value={draft.systemPrompt}
                onChange={(e) => onDraftChange({ ...draft, systemPrompt: e.target.value })}
              />
            </div>
          </div>

          {/* actions */}
          <div className="ag-actions">
            <button type="button" className="btn btn-primary" onClick={onSaveAgent} disabled={saving}>
              <Check aria-hidden="true" />{saving ? "保存中…" : "保存配置"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onDiscardDraft} disabled={saving}>
              重置草稿
            </button>
            {activeAgent ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => onDeleteAgent(activeAgent)} disabled={saving}>
                  <Trash2 aria-hidden="true" /> 删除此 Agent
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => onRefresh()} disabled={saving}>
                  <RefreshCw aria-hidden="true" /> 刷新数据
                </button>
              </>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
