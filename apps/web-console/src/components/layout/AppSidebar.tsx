import { Boxes, Bot, Circle, LayoutGrid, List, MessageSquare, Settings, Workflow } from "lucide-react";
import { BrandMark } from "../BrandMark";
import type { AppView } from "../../app/types";
import type { HealthStatus, SessionSummary, AgentProfile, SkillRegistryItem } from "../../api";
import type { SessionMetadataMap } from "../../session-metadata";
import type { SettingsSection } from "../../settings-route";

type SidebarProps = {
  view: AppView;
  health: HealthStatus | null;
  sessions: SessionSummary[];
  activeSessionId: string | null;
  sessionMetadata: SessionMetadataMap;
  sessionTitleFor: (session: SessionSummary) => string;
  agents: AgentProfile[];
  activeAgentId: string | null;
  installedSkills: SkillRegistryItem[];
  onNavigate: (view: AppView) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectAgent: (agent: AgentProfile) => void;
  onOpenSettings: (section: SettingsSection) => void;
};

const workspaceNav: { label: string; view: AppView; icon: typeof LayoutGrid; badge?: number }[] = [
  { label: "Agent 草稿", view: "agent", icon: LayoutGrid },
  { label: "Skill Hub", view: "skills", icon: Boxes },
  { label: "SOP Builder", view: "builder", icon: Workflow },
  { label: "测试聊天", view: "chat", icon: MessageSquare },
];

const builderTemplates = [
  { name: "标准评审流", sub: "4 步 · 常用" },
  { name: "数据管线", sub: "6 步" },
  { name: "内容创作", sub: "5 步" },
];

export function AppSidebar({
  view,
  health,
  sessions,
  activeSessionId,
  sessionMetadata,
  sessionTitleFor,
  agents,
  activeAgentId,
  installedSkills,
  onNavigate,
  onSelectSession,
  onSelectAgent,
  onOpenSettings,
}: SidebarProps) {
  const isNavActive = (target: AppView): boolean => view === target;

  return (
    <aside className="sidebar" aria-label="Orbit 工作台导航">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <BrandMark size={18} />
        </span>
        <span className="brand-text">Orbit</span>
      </div>

      <nav className="nav" aria-label="工作台导航">
        <div className="nav-label">工作台</div>
        {workspaceNav.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(item.view);
          const badge =
            item.view === "agent"
              ? agents.length
              : item.view === "skills"
                ? installedSkills.length
                : item.view === "chat"
                  ? sessions.length
                  : undefined;
          return (
            <button
              key={item.view}
              type="button"
              className={`nav-item ${active ? "on" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.view)}
            >
              <Icon aria-hidden="true" />
              {item.label}
              {badge !== undefined ? <span className="nav-badge">{badge}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="ctx">
        {/* CHAT context */}
        <div data-ctx="chat" className={view === "chat" ? "" : "view-hide"}>
          <div className="ctx-label">历史会话</div>
          {sessions.length === 0 ? (
            <div className="draft-sub" style={{ padding: "9px 10px" }}>
              暂无会话
            </div>
          ) : (
            sessions.map((session) => {
              const pinned = sessionMetadata[session.id]?.pinned;
              const live = session.busy;
              const dotClass = pinned ? "conv-dot pin" : live ? "conv-dot live" : "conv-dot";
              const sub = pinned
                ? "置顶 · 最近"
                : live
                  ? "运行中"
                  : "历史会话";
              return (
                <div
                  key={session.id}
                  className={`conv ${session.id === activeSessionId ? "on" : ""}`}
                  onClick={() => onSelectSession(session.id)}
                >
                  <span className={dotClass} aria-hidden="true" />
                  <div className="conv-main">
                    <div className="conv-title">{sessionTitleFor(session)}</div>
                    <div className="conv-sub">{sub}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* AGENT context */}
        <div data-ctx="agent" className={view === "agent" ? "" : "view-hide"}>
          <div className="ctx-label">Agent 草稿</div>
          {agents.length === 0 ? (
            <div className="draft-sub" style={{ padding: "9px 10px" }}>
              还没有 Agent 草稿
            </div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.id}
                className={`draft ${agent.id === activeAgentId ? "on" : ""}`}
                onClick={() => onSelectAgent(agent)}
              >
                <span className="draft-ic" aria-hidden="true">
                  <Bot aria-hidden="true" />
                </span>
                <div className="draft-main">
                  <div className="draft-name">{agent.name}</div>
                  <div className="draft-sub">
                    {agent.skills.length} 项技能 · {agent.id === activeAgentId ? "已选中" : "草稿"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* SKILLS context */}
        <div data-ctx="skills" className={view === "skills" ? "" : "view-hide"}>
          <div className="ctx-label">已安装</div>
          {installedSkills.length === 0 ? (
            <div className="draft-sub" style={{ padding: "9px 10px" }}>
              尚未安装技能
            </div>
          ) : (
            installedSkills.map((skill) => (
              <div key={skill.id} className="draft" onClick={() => onNavigate("skills")}>
                <span className="draft-ic" aria-hidden="true">
                  <Circle aria-hidden="true" />
                </span>
                <div className="draft-main">
                  <div className="draft-name">{skill.name}</div>
                  <div className="draft-sub">{skill.installedVersion || skill.version} · 已安装</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* BUILDER context */}
        <div data-ctx="builder" className={view === "builder" ? "" : "view-hide"}>
          <div className="ctx-label">SOP 模板</div>
          {builderTemplates.map((tpl) => (
            <div key={tpl.name} className="draft" onClick={() => onNavigate("builder")}>
              <span className="draft-ic" aria-hidden="true">
                <List aria-hidden="true" />
              </span>
              <div className="draft-main">
                <div className="draft-name">{tpl.name}</div>
                <div className="draft-sub">{tpl.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="foot">
        <button type="button" className="foot-item" onClick={() => onOpenSettings("profile")}>
          <Settings aria-hidden="true" />
          设置
        </button>
        <div className="health">
          <span className="health-dot" aria-hidden="true" />
          <span className="health-txt">
            <b>本地运行</b> · {health?.ok ? "正常" : "未连接"}
          </span>
        </div>
      </div>
    </aside>
  );
}
