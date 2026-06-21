import { Bot, Plus, RefreshCw, SearchCheck } from "lucide-react";
import { useState } from "react";
import type { AgentProfile } from "../../../api";
import { formatDateTime } from "../../../lib/format";
import { AgentAvatar } from "../components/AgentAvatar";

function draftUpdatedTime(agent: AgentProfile): string {
  return formatDateTime(agent.updatedAt ?? agent.createdAt);
}

function draftUpdatedDateTime(agent: AgentProfile): string | undefined {
  const value = agent.updatedAt ?? agent.createdAt;
  return value ? new Date(value).toISOString() : undefined;
}

export function AgentDraftsPage({
  agents,
  error,
  loading,
  saving,
  onCreateAgent,
  onOpenAgent,
  onRefresh,
}: {
  agents: AgentProfile[];
  error: string | null;
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

  return (
    <main className="agent-drafts-shell">
      <header className="agent-drafts-hero">
        <div className="agent-drafts-title">
          <span>Agent drafts</span>
          <h1>Agent 草稿</h1>
          <p>选择草稿，继续配置技能、动作和提示词。</p>
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

      {error ? (
        <div className="agent-error-banner" role="alert">
          <strong>Agent 草稿操作失败</strong>
          <span>{error}</span>
        </div>
      ) : null}

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
            <small>创建新草稿</small>
          </button>

          {filteredAgents.length === 0 ? (
            <div className="agent-draft-empty">
              <Bot size={26} strokeWidth={2.2} aria-hidden="true" />
              <strong>{agents.length === 0 ? "还没有 agent 草稿" : "没有匹配的草稿"}</strong>
              <span>{agents.length === 0 ? "新建后会显示在这里。" : "换个关键词再试。"}</span>
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <button className="agent-draft-card" key={agent.id} type="button" onClick={() => onOpenAgent(agent)}>
                <span className="agent-draft-heading">
                  <AgentAvatar avatarId={agent.avatarId} label={agent.name} />
                  <span className="agent-draft-copy">
                    <strong>{agent.name}</strong>
                    <small>{agent.description}</small>
                  </span>
                </span>
                <span className="agent-draft-meta">
                  <span>最新修改</span>
                  <time dateTime={draftUpdatedDateTime(agent)}>{draftUpdatedTime(agent)}</time>
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
