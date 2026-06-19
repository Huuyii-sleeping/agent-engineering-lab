import { Bot, Plus, RefreshCw, SearchCheck } from "lucide-react";
import { useState } from "react";
import type { AgentProfile } from "../../../api";

export function AgentDraftsPage({
  agents,
  loading,
  saving,
  onCreateAgent,
  onOpenAgent,
  onRefresh,
}: {
  agents: AgentProfile[];
  loading: boolean;
  saving: boolean;
  onCreateAgent: () => void;
  onOpenAgent: (agent: AgentProfile) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredAgents = agents.filter((agent) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return `${agent.name} ${agent.description} ${agent.scenario}`.toLowerCase().includes(keyword);
  });
  const totalSkillCount = new Set(agents.flatMap((agent) => agent.skillIds)).size;
  const totalActionCount = agents.reduce((count, agent) => count + agent.actions.length, 0);

  return (
    <main className="agent-drafts-shell">
      <header className="agent-drafts-hero">
        <div className="agent-drafts-title">
          <span>Agent drafts</span>
          <h1>选择一个 Agent 草稿继续配置</h1>
          <p>这里像设计稿工作台一样管理所有 agent。配置项不会在列表页展开，进入具体草稿后再编辑技能、动作和提示词。</p>
        </div>
        <div className="agent-drafts-actions">
          <button className="agent-secondary-action" type="button" onClick={onRefresh} disabled={loading || saving}>
            <RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" />
            <span>刷新</span>
          </button>
          <button className="agent-primary-action" type="button" onClick={onCreateAgent} disabled={saving}>
            <Plus size={17} strokeWidth={2.3} aria-hidden="true" />
            <span>新建 Agent</span>
          </button>
        </div>
      </header>

      <section className="agent-drafts-summary" aria-label="Agent 草稿概览">
        <div>
          <span>草稿</span>
          <strong>{agents.length}</strong>
        </div>
        <div>
          <span>已使用 Skill</span>
          <strong>{totalSkillCount}</strong>
        </div>
        <div>
          <span>自定义 Action</span>
          <strong>{totalActionCount}</strong>
        </div>
      </section>

      <section className="agent-drafts-workspace" aria-label="Agent 草稿库">
        <div className="agent-drafts-toolbar">
          <div className="agent-drafts-search">
            <SearchCheck size={17} strokeWidth={2.2} aria-hidden="true" />
            <input value={query} placeholder="搜索 Agent 草稿" onChange={(event) => setQuery(event.currentTarget.value)} />
          </div>
          <span>{filteredAgents.length} 个草稿</span>
        </div>

        <div className="agent-draft-grid">
          <button className="agent-draft-card agent-draft-card--new" type="button" onClick={onCreateAgent} disabled={saving}>
            <span className="agent-draft-new-mark">
              <Plus size={24} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <strong>新建 Agent</strong>
            <small>创建一个新的 agent 草稿</small>
          </button>

          {filteredAgents.length === 0 ? (
            <div className="agent-draft-empty">
              <Bot size={26} strokeWidth={2.2} aria-hidden="true" />
              <strong>{agents.length === 0 ? "还没有 agent 草稿" : "没有匹配的草稿"}</strong>
              <span>{agents.length === 0 ? "点击新建 Agent 后会出现在这里。" : "换一个关键词再试。"}</span>
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <button className="agent-draft-card" key={agent.id} type="button" onClick={() => onOpenAgent(agent)}>
                <span className="agent-draft-preview" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="agent-draft-copy">
                  <strong>{agent.name}</strong>
                  <small>{agent.description}</small>
                </span>
                <span className="agent-draft-meta">
                  <span>{agent.skillIds.length} skills</span>
                  <span>{agent.actions.length} actions</span>
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
