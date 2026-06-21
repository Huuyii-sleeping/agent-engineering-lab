import {
  Bot,
  Boxes,
  ChevronDown,
  Download,
  FolderTree,
  Hammer,
  MessageSquare,
  Plus,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import type { AgentProfile } from "../../../api";
import type { AppView } from "../../../app/types";
import { formatDateTime } from "../../../lib/format";

type WorkspaceTreeNode = {
  id: string;
  label: string;
  meta: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
};

function TreeNode({ node }: { node: WorkspaceTreeNode }) {
  const Icon = node.icon;
  return (
    <li role="none">
      <button
        className={`agent-tree-node ${node.active ? "agent-tree-node--active" : ""}`}
        type="button"
        role="treeitem"
        aria-current={node.active ? "page" : undefined}
        onClick={node.onSelect}
      >
        <span className="agent-tree-node-icon">
          <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
        </span>
        <span className="agent-tree-node-copy">
          <strong>{node.label}</strong>
          <small>{node.meta}</small>
        </span>
      </button>
    </li>
  );
}

export function AgentWorkspaceTree({
  activeAgentId,
  activeView,
  agents,
  downloadedSkillCount,
  saving,
  onCreateAgent,
  onOpenAgent,
  onOpenBuilder,
  onOpenChat,
  onOpenDrafts,
  onOpenSkillHub,
  onRefreshAgents,
}: {
  activeAgentId: string | null;
  activeView: AppView;
  agents: AgentProfile[];
  downloadedSkillCount: number;
  saving: boolean;
  onCreateAgent: () => void;
  onOpenAgent: (agent: AgentProfile) => void;
  onOpenBuilder: () => void;
  onOpenChat: () => void;
  onOpenDrafts: () => void;
  onOpenSkillHub: () => void;
  onRefreshAgents: () => void;
}) {
  const workspaceNodes: WorkspaceTreeNode[] = [
    {
      id: "drafts",
      label: "Agent 草稿",
      meta: `${agents.length} 个草稿`,
      icon: FolderTree,
      active: activeView === "agents" || activeView === "agent-config",
      onSelect: onOpenDrafts,
    },
    {
      id: "skillhub",
      label: "Skill Hub",
      meta: `${downloadedSkillCount} 个已加载`,
      icon: Download,
      active: activeView === "skills",
      onSelect: onOpenSkillHub,
    },
    {
      id: "builder",
      label: "Agent Builder",
      meta: "技能与 SOP 装配",
      icon: Hammer,
      active: activeView === "builder",
      onSelect: onOpenBuilder,
    },
    {
      id: "chat",
      label: "测试聊天",
      meta: activeAgentId ? "使用当前 Agent" : "选择 Agent 后测试",
      icon: MessageSquare,
      active: activeView === "chat",
      onSelect: onOpenChat,
    },
  ];

  return (
    <aside className="agent-tree-panel" aria-label="Agent 工作台导航">
      <div className="agent-tree-brand">
        <span className="agent-tree-brand-mark" aria-hidden="true">
          <Boxes size={18} strokeWidth={2.5} />
        </span>
        <span>
          <strong>Agent graph</strong>
          <small>本地能力树</small>
        </span>
      </div>

      <div className="agent-tree-actions">
        <button type="button" onClick={onCreateAgent} disabled={saving}>
          <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
          <span>新建</span>
        </button>
        <button type="button" onClick={onRefreshAgents}>
          <RefreshCw size={14} strokeWidth={2.4} aria-hidden="true" />
          <span>刷新</span>
        </button>
      </div>

      <nav className="agent-tree-nav" aria-label="Agent 工作台树">
        <section className="agent-tree-section">
          <div className="agent-tree-section-heading">
            <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
            <span>Workspace</span>
          </div>
          <ul role="tree" aria-label="工作台内容">
            {workspaceNodes.map((node) => (
              <TreeNode key={node.id} node={node} />
            ))}
          </ul>
        </section>

        <section className="agent-tree-section">
          <div className="agent-tree-section-heading">
            <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
            <span>Agent drafts</span>
          </div>
          {agents.length > 0 ? (
            <ul role="tree" aria-label="Agent 草稿">
              {agents.map((agent) => (
                <TreeNode
                  key={agent.id}
                  node={{
                    id: agent.id,
                    label: agent.name,
                    meta: `最新修改 ${formatDateTime(agent.updatedAt ?? agent.createdAt)}`,
                    icon: Bot,
                    active: activeView === "agent-config" && activeAgentId === agent.id,
                    onSelect: () => onOpenAgent(agent),
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="agent-tree-empty">还没有保存的 Agent 草稿。</p>
          )}
        </section>
      </nav>
    </aside>
  );
}
