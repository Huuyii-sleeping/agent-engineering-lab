import { Boxes, LayoutGrid, MessageSquare, PanelLeftClose, PanelLeftOpen, Settings, Workflow } from "lucide-react";
import { BrandMark } from "../BrandMark";
import type { AppView } from "../../app/types";
import type { HealthStatus, SessionSummary, AgentProfile, SkillRegistryItem } from "../../api";
import type { SettingsSection } from "../../settings-route";

type SidebarProps = {
  view: AppView;
  health: HealthStatus | null;
  sessions: SessionSummary[];
  agents: AgentProfile[];
  installedSkills: SkillRegistryItem[];
  collapsed: boolean;
  onNavigate: (view: AppView) => void;
  onToggleCollapsed: () => void;
  onOpenSettings: (section: SettingsSection) => void;
};

const workspaceNav: { label: string; view: AppView; icon: typeof LayoutGrid; badge?: number }[] = [
  { label: "Agent 草稿", view: "agent", icon: LayoutGrid },
  { label: "Skill Hub", view: "skills", icon: Boxes },
  { label: "SOP Builder", view: "builder", icon: Workflow },
  { label: "测试聊天", view: "chat", icon: MessageSquare },
];

export function AppSidebar({
  view,
  health,
  sessions,
  agents,
  installedSkills,
  collapsed,
  onNavigate,
  onToggleCollapsed,
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
        <div className="nav-label-row">
          <span className="nav-label">工作台</span>
          <button type="button" className="sidebar-collapse-action" aria-label={collapsed ? "展开侧栏" : "折叠侧栏"} title={collapsed ? "展开侧栏" : "折叠侧栏"} onClick={onToggleCollapsed}>
            {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </button>
        </div>
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
              title={item.label}
              onClick={() => onNavigate(item.view)}
            >
              <Icon aria-hidden="true" />
              {item.label}
              {badge !== undefined ? <span className="nav-badge">{badge}</span> : null}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-spacer" aria-hidden="true" />

      <div className="foot">
        <button type="button" className="foot-item" title="设置" onClick={() => onOpenSettings("profile")}>
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
