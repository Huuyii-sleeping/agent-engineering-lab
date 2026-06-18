import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  AppWindow,
  ArrowLeft,
  Bell,
  Bot,
  BrainCircuit,
  Check,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Code2,
  Database,
  Download,
  Folder,
  Grid2X2,
  Globe2,
  HelpCircle,
  Image,
  Info,
  Keyboard,
  Lock,
  LogOut,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Pencil,
  PenTool,
  Pin,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  SearchCheck,
  SendHorizontal,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import rehypeHighlight from "rehype-highlight";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  agentSkillCatalog,
  agentSopCatalog,
  readDownloadedSkillIds,
  readAgentBuilderConfig,
  toggleAgentBuilderId,
  writeDownloadedSkillIds,
  writeAgentBuilderConfig,
  type AgentBuilderConfig,
} from "./agent-builder";
import {
  createAgentProfile,
  createAgentEventStream,
  createSession,
  deleteAgentProfile,
  fetchAgents,
  fetchHealth,
  fetchProfile,
  fetchSession,
  fetchSessions,
  updateAgentProfile,
  sendSessionMessageStream,
  updateProfile,
  defaultAgentProfileInput,
  defaultUserProfile,
  type AgentProfile,
  type AgentProfileInput,
  type ChatMessage,
  type HealthStatus,
  type SessionDetail,
  type SessionSummary,
  type UserProfile,
} from "./api";
import { shouldReloadSessionFromAgentEvent } from "./chat-stream-state";
import {
  hideSession,
  hideSessions,
  isSessionHidden,
  readSessionMetadata,
  renameSession,
  sessionDisplayTitle,
  summarizeSessionTitle,
  toggleSessionPinned,
  writeSessionMetadata,
  type SessionMetadataMap,
} from "./session-metadata";
import { resolveActiveSessionId } from "./session-selection";
import { settingsSectionFromHash, type SettingsSection } from "./settings-route";
import { getNextTheme, readStoredTheme, writeStoredTheme, type ThemeMode } from "./theme";
import "./styles.css";

type LoadState = "idle" | "loading" | "sending";
type StreamState = "connecting" | "connected" | "disconnected";
type AppView = "landing" | "agents" | "chat" | "skills" | "builder" | "settings";
type WorkspaceTab = Exclude<AppView, "landing" | "settings">;

type NavItem = {
  label: string;
  icon: LucideIcon;
};

type QuickAction = {
  label: string;
  icon: LucideIcon;
};

type SidebarSetting = {
  label: string;
  icon: LucideIcon;
  section: SettingsSection;
};

type SessionSummaryTitleMap = Record<string, string>;

const shortcutHints = ["Ctrl K", "Ctrl Enter", "Shift Enter", "Ctrl C"];

const navItems: NavItem[] = [
  { label: "AI 浏览器", icon: SearchCheck },
  { label: "应用生成", icon: AppWindow },
  { label: "AI 创作", icon: PenTool },
  { label: "云盘", icon: Folder },
  { label: "更多", icon: Grid2X2 },
];

const workspaceTabs: Array<{ label: string; view: WorkspaceTab; icon: LucideIcon; description: string }> = [
  { label: "Agent 测试", view: "chat", icon: MessageSquare, description: "运行本地 agent 对话链路" },
  { label: "Skill 加载", view: "skills", icon: Download, description: "选择和下载可用技能" },
];

const quickActions: QuickAction[] = [
  { label: "快速", icon: Sparkles },
  { label: "帮我写作", icon: PenTool },
  { label: "图像生成", icon: Image },
  { label: "编程", icon: Code2 },
  { label: "更多", icon: MoreHorizontal },
];

const sidebarSettings: SidebarSetting[] = [
  { label: "个人设置", icon: UserRound, section: "profile" },
  { label: "偏好设置", icon: SlidersHorizontal, section: "preferences" },
  { label: "系统设置", icon: Settings, section: "system" },
];

const markdownComponents: Components = {
  a({ children, href }) {
    return (
      <a href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  },
};

function formatTime(value: number | null): string {
  if (!value) {
    return "未记录";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function messageText(message: ChatMessage): string {
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }
  return message.role === "assistant" ? "（空回复）" : "（空消息）";
}

function roleLabel(role: ChatMessage["role"]): string {
  if (role === "assistant") {
    return "AI Studio";
  }
  if (role === "user") {
    return "我";
  }
  if (role === "tool") {
    return "工具";
  }
  return "系统";
}

function sessionTimestamp(session: SessionSummary): number {
  return session.updatedAt ?? session.createdAt ?? 0;
}

function sortSessionsByRecent(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((left, right) => sessionTimestamp(right) - sessionTimestamp(left));
}

function sortSessionsForSidebar(sessions: SessionSummary[], metadata: SessionMetadataMap): SessionSummary[] {
  return [...sessions].sort((left, right) => {
    const leftPinned = metadata[left.id]?.pinned === true;
    const rightPinned = metadata[right.id]?.pinned === true;
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }
    return sessionTimestamp(right) - sessionTimestamp(left);
  });
}

function agentDraftFromProfile(agent: AgentProfile): AgentProfileInput {
  return {
    name: agent.name,
    description: agent.description,
    scenario: agent.scenario,
    skillIds: agent.skillIds,
    actions: agent.actions,
    systemPrompt: agent.systemPrompt,
  };
}

function agentSkillName(skillId: string): string {
  return agentSkillCatalog.find((skill) => skill.id === skillId)?.name ?? skillId;
}

function streamLabel(state: StreamState): string {
  if (state === "connected") {
    return "SSE 已连接";
  }
  if (state === "connecting") {
    return "SSE 连接中";
  }
  return "SSE 未连接";
}

function MessageBody({ message }: { message: ChatMessage }) {
  const content = messageText(message);
  if (message.role === "assistant" && message.name === "streaming" && !message.content?.trim()) {
    return <p className="typing-placeholder">正在等待本地 agent 返回结果...</p>;
  }
  if (message.role === "user") {
    return <p>{content}</p>;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown components={markdownComponents} rehypePlugins={[rehypeHighlight]} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function MessageAvatar({ role }: { role: ChatMessage["role"] }) {
  const Icon = role === "user" ? UserRound : role === "tool" ? Wrench : role === "system" ? CircleDot : Bot;
  return (
    <div className={`message-avatar message-avatar--${role}`} aria-hidden="true">
      <Icon size={16} strokeWidth={2.2} />
    </div>
  );
}

function NewConversationPanel({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="starter-panel starter-panel--new">
      <h2>有什么我能帮你的？</h2>
      {onCreate ? (
        <button className="primary-action" type="button" onClick={onCreate}>
          <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>新建对话</span>
        </button>
      ) : null}
    </div>
  );
}

function SettingsPage({
  activeSection,
  health,
  sessionCount,
  streamState,
  theme,
  editingProfile,
  profile,
  profileDraft,
  onBack,
  onCancelProfileEdit,
  onProfileDraftChange,
  onSaveProfile,
  onSectionChange,
  onToggleProfileEdit,
  onThemeToggle,
}: {
  activeSection: SettingsSection;
  health: HealthStatus | null;
  sessionCount: number;
  streamState: StreamState;
  theme: ThemeMode;
  editingProfile: boolean;
  profile: UserProfile;
  profileDraft: UserProfile;
  onBack: () => void;
  onCancelProfileEdit: () => void;
  onProfileDraftChange: (profile: UserProfile) => void;
  onSaveProfile: () => void;
  onSectionChange: (section: SettingsSection) => void;
  onToggleProfileEdit: () => void;
  onThemeToggle: () => void;
}) {
  return (
    <main className="settings-shell">
      <header className="settings-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="返回聊天">
          <ArrowLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <div className="settings-title">
          <h1>个人设置</h1>
          <span>AI Studio 本地控制台</span>
        </div>
      </header>

      <section className="settings-body" aria-label="个人设置内容">
        <aside className="settings-rail">
          <div className="settings-rail-brand">
            <span aria-hidden="true">
              <BrainCircuit size={20} strokeWidth={2.3} />
            </span>
            <div>
              <strong>AI Studio</strong>
              <small>Local workspace</small>
            </div>
          </div>
          <nav className="settings-tabs" aria-label="设置分区">
            {sidebarSettings.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={`settings-tab ${activeSection === item.section ? "settings-tab--active" : ""}`}
                  key={item.section}
                  type="button"
                  onClick={() => onSectionChange(item.section)}
                >
                  <Icon size={18} strokeWidth={2.1} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="settings-workbench">
          <div className="settings-panels">
            <section className={`settings-panel ${activeSection === "profile" ? "settings-panel--active" : ""}`}>
              <div className="settings-group">
                <p className="settings-group-title">隐私与权限</p>
                <div className="settings-list">
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--green">
                      <Lock size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>隐私与权限</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="settings-group">
                <p className="settings-group-title">通用设置</p>
                <div className="settings-list">
                  <button
                    className="settings-row"
                    type="button"
                    aria-expanded={editingProfile}
                    onClick={onToggleProfileEdit}
                  >
                    <span className="settings-row-icon settings-row-icon--blue">
                      <UserRound size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>编辑个人资料</strong>
                      <small>
                        {profile.displayName} · {profile.description}
                      </small>
                    </span>
                    <span className="settings-row-action">已支持</span>
                    {editingProfile ? (
                      <ChevronUp size={17} strokeWidth={2.2} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                    )}
                  </button>
                  {editingProfile ? (
                    <form className="profile-editor" onSubmit={(event) => event.preventDefault()}>
                      <label className="profile-field">
                        <span>显示名称</span>
                        <input
                          maxLength={24}
                          value={profileDraft.displayName}
                          onChange={(event) => onProfileDraftChange({ ...profileDraft, displayName: event.currentTarget.value })}
                        />
                      </label>
                      <label className="profile-field">
                        <span>身份描述</span>
                        <input
                          maxLength={48}
                          value={profileDraft.description}
                          onChange={(event) => onProfileDraftChange({ ...profileDraft, description: event.currentTarget.value })}
                        />
                      </label>
                      <div className="profile-editor-actions">
                        <button className="settings-secondary-action" type="button" onClick={onCancelProfileEdit}>
                          取消
                        </button>
                        <button className="settings-primary-action" type="button" onClick={onSaveProfile}>
                          保存
                        </button>
                      </div>
                    </form>
                  ) : null}
                  <div className="settings-row">
                    <span className="settings-row-icon settings-row-icon--blue">
                      <Globe2 size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>语言设置</strong>
                    </span>
                    <span className="settings-value-pill">中文（简体）</span>
                  </div>
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--gray">
                      <Keyboard size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>快捷键设置</strong>
                      <small>Ctrl K · Ctrl Enter · Shift Enter</small>
                    </span>
                    <span className="settings-row-action">已支持</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button className="settings-row" type="button" onClick={onThemeToggle}>
                    <span className="settings-row-icon settings-row-icon--green">
                      <Palette size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>外观设置</strong>
                    </span>
                    <span className="settings-value-pill">{theme === "dark" ? "深色" : "浅色"}</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--purple">
                      <Bell size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>通知设置</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--orange">
                      <Download size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>下载设置</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="settings-group">
                <p className="settings-group-title">关于</p>
                <div className="settings-list">
                  <div className="settings-row">
                    <span className="settings-row-icon settings-row-icon--blue">
                      <BrainCircuit size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>AI Studio</strong>
                      <small>
                        {profile.displayName} · {profile.description}
                      </small>
                    </span>
                    <span className="settings-row-action">本地控制台</span>
                  </div>
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--blue">
                      <Info size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>关于 AI Studio</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>

            <section className={`settings-panel ${activeSection === "preferences" ? "settings-panel--active" : ""}`}>
              <div className="settings-group">
                <p className="settings-group-title">AI 工具</p>
                <div className="settings-list">
                  <div className="settings-row">
                    <span className="settings-row-icon settings-row-icon--blue">
                      <Sparkles size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>Markdown 渲染</strong>
                    </span>
                    <span className="settings-row-action">已启用</span>
                  </div>
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--purple">
                      <MessageSquare size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>对话浮窗</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--orange">
                      <Monitor size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>桌面悬浮球</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--red">
                      <BookOpen size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>拖拽文档时显示阅读浮窗</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--blue">
                      <Wrench size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>浏览器 AI 工具</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="settings-group">
                <p className="settings-group-title">帮助我们</p>
                <div className="settings-list">
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--purple">
                      <HelpCircle size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>帮助与反馈</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>

            <section className={`settings-panel ${activeSection === "system" ? "settings-panel--active" : ""}`}>
              <div className="settings-group">
                <p className="settings-group-title">数据权限</p>
                <div className="settings-list">
                  <div className="settings-row">
                    <span className="settings-row-icon settings-row-icon--blue">
                      <Database size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>历史会话</strong>
                    </span>
                    <span className="settings-row-action">{sessionCount} 个</span>
                  </div>
                </div>
              </div>

              <div className="settings-group">
                <p className="settings-group-title">本地服务</p>
                <div className="settings-list">
                  <div className="settings-row">
                    <span className="settings-row-icon settings-row-icon--green">
                      <Radio className={`stream-icon stream-icon--${streamState}`} size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>SSE 连接</strong>
                    </span>
                    <span className="settings-row-action">{streamLabel(streamState)}</span>
                  </div>
                  <div className="settings-row">
                    <span className="settings-row-icon settings-row-icon--blue">
                      <CheckCircle2 size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>BFF 服务</strong>
                    </span>
                    <span className="settings-row-action">{health?.bffStatus ?? "unknown"}</span>
                  </div>
                  <div className="settings-row">
                    <span className="settings-row-icon settings-row-icon--green">
                      <ShieldCheck size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>Agent 服务</strong>
                    </span>
                    <span className="settings-row-action">{health?.agentStatus ?? "unknown"}</span>
                  </div>
                </div>
              </div>

              <div className="settings-group">
                <p className="settings-group-title">高级设置</p>
                <div className="settings-list">
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--orange">
                      <Download size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>获取最新配置</strong>
                    </span>
                    <span className="settings-row-link">获取配置</span>
                  </button>
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--orange">
                      <RotateCcw size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>还原初始设置</strong>
                    </span>
                    <span className="settings-row-link">还原</span>
                  </button>
                </div>
              </div>

              <div className="settings-group">
                <p className="settings-group-title">其他</p>
                <div className="settings-list">
                  <button className="settings-row" type="button">
                    <span className="settings-row-icon settings-row-icon--gray">
                      <LogOut size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="settings-row-copy">
                      <strong>退出登录</strong>
                    </span>
                    <span className="settings-row-action">待开发</span>
                    <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="项目导航">
        <span className="landing-brand">
          <span className="brand-mark" aria-hidden="true">
            <BrainCircuit size={21} strokeWidth={2.4} />
          </span>
          <strong>AI Studio</strong>
        </span>
        <button className="landing-nav-action" type="button" onClick={onStart}>
          立即开始
        </button>
      </nav>

      <section className="landing-hero" aria-label="项目介绍">
        <div className="landing-kicker">
          <Sparkles size={16} strokeWidth={2.2} aria-hidden="true" />
          <span>All-in-one local agent workspace</span>
        </div>
        <h1>把对话、技能和流程装进一个本地 Agent 工作台</h1>
        <p>
          AI Studio 面向本地研发与自动化执行场景，把 Agent 测试、Skill 加载、SOP 编排和未来的 Agent 组装放到同一个可扩展控制台里。
        </p>
        <div className="landing-actions">
          <button className="landing-primary-action" type="button" onClick={onStart}>
            <span>立即开始</span>
            <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <span>进入 Agent 管理界面，创建、配置并测试你的本地 agent</span>
        </div>
      </section>

      <section className="landing-preview" aria-label="能力概览">
        <div className="landing-preview-card landing-preview-card--main">
          <span>Agent 管理</span>
          <strong>管理不同角色的 agent</strong>
          <small>创建、编辑、删除 agent，并为每个 agent 保存独立配置。</small>
        </div>
        <div className="landing-preview-card">
          <span>Skill 与 Action</span>
          <strong>组合可复用能力</strong>
          <small>按 agent 选择技能，维护自定义操作和个性化说明。</small>
        </div>
        <div className="landing-preview-card">
          <span>Agent 测试</span>
          <strong>保留原聊天链路</strong>
          <small>从具体 agent 进入测试页，验证本地 Agent service、BFF 和 SSE。</small>
        </div>
      </section>
    </main>
  );
}

function AgentManagerPage({
  agents,
  activeAgent,
  draft,
  loading,
  saving,
  onCreateAgent,
  onDeleteAgent,
  onDraftChange,
  onRefresh,
  onSaveAgent,
  onSelectAgent,
  onTestAgent,
}: {
  agents: AgentProfile[];
  activeAgent: AgentProfile | null;
  draft: AgentProfileInput;
  loading: boolean;
  saving: boolean;
  onCreateAgent: () => void;
  onDeleteAgent: (agent: AgentProfile) => void;
  onDraftChange: (draft: AgentProfileInput) => void;
  onRefresh: () => void;
  onSaveAgent: () => void;
  onSelectAgent: (agent: AgentProfile) => void;
  onTestAgent: (agent: AgentProfile) => void;
}) {
  const selectedSkillSet = new Set(draft.skillIds);

  function toggleSkill(skillId: string): void {
    onDraftChange({
      ...draft,
      skillIds: toggleAgentBuilderId(
        draft.skillIds,
        skillId,
        agentSkillCatalog.map((skill) => skill.id),
      ),
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
    <main className="agent-manager-shell">
      <header className="agent-manager-header">
        <div className="agent-manager-title">
          <span>Agent workspace</span>
          <h1>Agent 管理</h1>
          <p>先管理你的 agent，再进入测试对话。每个 agent 都可以拥有独立的技能、操作和个性化提示。</p>
        </div>
        <div className="agent-manager-actions">
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

      <section className="agent-manager-grid" aria-label="Agent 管理工作台">
        <aside className="agent-list-panel" aria-label="Agent 列表">
          <div className="agent-panel-heading">
            <span>Agents</span>
            <strong>{agents.length} 个</strong>
          </div>

          <div className="agent-list">
            {agents.length === 0 ? (
              <div className="agent-empty">
                <Bot size={24} strokeWidth={2.2} aria-hidden="true" />
                <strong>还没有 agent</strong>
                <span>点击新建 Agent 开始配置。</span>
              </div>
            ) : (
              agents.map((agent) => (
                <button
                  className={`agent-list-item ${activeAgent?.id === agent.id ? "agent-list-item--active" : ""}`}
                  key={agent.id}
                  type="button"
                  onClick={() => onSelectAgent(agent)}
                >
                  <span className="agent-list-icon" aria-hidden="true">
                    <Bot size={17} strokeWidth={2.2} />
                  </span>
                  <span className="agent-list-copy">
                    <strong>{agent.name}</strong>
                    <small>{agent.description}</small>
                  </span>
                  <span className="agent-list-count">{agent.skillIds.length}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="agent-editor-panel" aria-label="Agent 详情编辑">
          {activeAgent ? (
            <>
              <div className="agent-panel-heading agent-panel-heading--editor">
                <div>
                  <span>Agent detail</span>
                  <strong>{draft.name}</strong>
                </div>
                <div className="agent-editor-actions">
                  <button className="agent-danger-action" type="button" onClick={() => onDeleteAgent(activeAgent)} disabled={saving}>
                    <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
                    <span>删除</span>
                  </button>
                  <button className="agent-secondary-action" type="button" onClick={onSaveAgent} disabled={saving}>
                    <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                    <span>{saving ? "保存中" : "保存"}</span>
                  </button>
                  <button className="agent-primary-action" type="button" onClick={() => onTestAgent(activeAgent)} disabled={saving}>
                    <MessageSquare size={16} strokeWidth={2.2} aria-hidden="true" />
                    <span>使用 / 测试</span>
                  </button>
                </div>
              </div>

              <div className="agent-editor-form">
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
            </>
          ) : (
            <div className="agent-editor-empty">
              <BrainCircuit size={30} strokeWidth={2.2} aria-hidden="true" />
              <strong>选择或创建一个 agent</strong>
              <span>Agent 详情会在这里编辑。</span>
            </div>
          )}
        </section>

        <aside className="agent-config-panel" aria-label="Agent 能力配置">
          <div className="agent-panel-heading">
            <span>Skills</span>
            <strong>{draft.skillIds.length} 已选</strong>
          </div>
          <div className="agent-skill-list">
            {agentSkillCatalog.map((skill) => {
              const selected = selectedSkillSet.has(skill.id);
              return (
                <button
                  className={`agent-skill-item ${selected ? "agent-skill-item--selected" : ""}`}
                  key={skill.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleSkill(skill.id)}
                  disabled={!activeAgent}
                >
                  <span>
                    <strong>{skill.name}</strong>
                    <small>{skill.category} · {skill.provider} · v{skill.version}</small>
                  </span>
                  <span className="agent-skill-check">
                    {selected ? <Check size={14} strokeWidth={2.7} aria-hidden="true" /> : <Plus size={14} strokeWidth={2.5} aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="agent-panel-heading agent-panel-heading--actions">
            <span>Custom actions</span>
            <button className="agent-mini-action" type="button" onClick={addAction} disabled={!activeAgent}>
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
    </main>
  );
}

function AgentTestBanner({ agent, onBack }: { agent: AgentProfile | null; onBack: () => void }) {
  if (!agent) {
    return null;
  }
  return (
    <section className="agent-test-banner" aria-label="当前测试 Agent">
      <div className="agent-test-copy">
        <span>当前测试 Agent</span>
        <strong>{agent.name}</strong>
        <small>{agent.scenario}</small>
      </div>
      <div className="agent-test-meta">
        <span>{agent.skillIds.length} skills</span>
        <span>{agent.actions.length} actions</span>
        <span>{agent.skillIds.slice(0, 2).map(agentSkillName).join(" / ") || "未选择 skill"}</span>
      </div>
      <button className="agent-secondary-action" type="button" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
        <span>返回管理</span>
      </button>
    </section>
  );
}

function WorkspaceTabs({ activeView, onChange }: { activeView: WorkspaceTab; onChange: (view: WorkspaceTab) => void }) {
  return (
    <header className="workspace-tabs" aria-label="工作台标签">
      <div className="workspace-tabs-copy">
        <span>Workspace</span>
        <strong>{workspaceTabs.find((tab) => tab.view === activeView)?.label ?? "工作台"}</strong>
      </div>
      <div className="workspace-tab-list" role="tablist">
        {workspaceTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.view === activeView;
          return (
            <button
              className={`workspace-tab ${active ? "workspace-tab--active" : ""}`}
              key={tab.view}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.view)}
              title={tab.description}
            >
              <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}

function SkillHubPage({
  downloadedSkillIds,
  onToggleSkill,
}: {
  downloadedSkillIds: string[];
  onToggleSkill: (skillId: string) => void;
}) {
  const downloadedCount = downloadedSkillIds.length;

  return (
    <main className="skillhub-shell">
      <section className="skillhub-hero">
        <div>
          <span>Skill Hub</span>
          <h1>加载适合当前工作流的技能</h1>
          <p>先用本地 catalog 模拟 SkillHub：查看技能来源、版本和状态，选择下载后可作为后续 Agent 组装的能力池。</p>
        </div>
        <div className="skillhub-meter" aria-label="已下载技能数量">
          <strong>{downloadedCount}</strong>
          <span>已下载</span>
        </div>
      </section>

      <section className="skillhub-grid" aria-label="可用技能">
        {agentSkillCatalog.map((skill) => {
          const downloaded = downloadedSkillIds.includes(skill.id);
          return (
            <article className={`skillhub-card ${downloaded ? "skillhub-card--downloaded" : ""}`} key={skill.id}>
              <div className="skillhub-card-top">
                <span>{skill.category}</span>
                <strong>{skill.provider}</strong>
              </div>
              <h2>{skill.name}</h2>
              <p>{skill.summary}</p>
              <div className="skillhub-card-meta">
                <span>v{skill.version}</span>
                <span>{downloaded ? "已加载" : "可下载"}</span>
              </div>
              <button className="skillhub-action" type="button" onClick={() => onToggleSkill(skill.id)}>
                {downloaded ? (
                  <>
                    <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                    <span>已下载</span>
                  </>
                ) : (
                  <>
                    <Download size={16} strokeWidth={2.4} aria-hidden="true" />
                    <span>下载 Skill</span>
                  </>
                )}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function AgentBuilderPage({
  config,
  onConfigChange,
}: {
  config: AgentBuilderConfig;
  onConfigChange: (config: AgentBuilderConfig) => void;
}) {
  const selectedSkills = agentSkillCatalog.filter((skill) => config.selectedSkillIds.includes(skill.id));
  const selectedSopSteps = agentSopCatalog.filter((step) => config.selectedSopStepIds.includes(step.id));
  const readinessScore = Math.round(
    ((selectedSkills.length / agentSkillCatalog.length + selectedSopSteps.length / agentSopCatalog.length) / 2) * 100,
  );

  function toggleSkill(skillId: string): void {
    onConfigChange({
      ...config,
      selectedSkillIds: toggleAgentBuilderId(
        config.selectedSkillIds,
        skillId,
        agentSkillCatalog.map((skill) => skill.id),
      ),
    });
  }

  function toggleSopStep(stepId: string): void {
    onConfigChange({
      ...config,
      selectedSopStepIds: toggleAgentBuilderId(
        config.selectedSopStepIds,
        stepId,
        agentSopCatalog.map((step) => step.id),
      ),
    });
  }

  return (
    <main className="builder-shell">
      <header className="builder-hero">
        <div className="builder-hero-copy">
          <span>Agent Builder</span>
          <h1>Agent 工坊</h1>
          <p>选择技能、编排 SOP，并把它保存为后续可复用的 agent 子页面。</p>
        </div>
        <div className="builder-status-panel" aria-label="Agent 配置就绪度">
          <strong>{readinessScore}%</strong>
          <span>配置就绪度</span>
        </div>
      </header>

      <section className="builder-workbench" aria-label="Agent 装配台">
        <div className="builder-column">
          <div className="builder-section-heading">
            <span>Skill 池</span>
            <strong>{selectedSkills.length} 已选</strong>
          </div>
          <div className="builder-card-list">
            {agentSkillCatalog.map((skill) => {
              const selected = config.selectedSkillIds.includes(skill.id);
              return (
                <button
                  className={`builder-skill-card ${selected ? "builder-skill-card--selected" : ""}`}
                  key={skill.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleSkill(skill.id)}
                >
                  <span className="builder-card-topline">
                    <span>{skill.category}</span>
                    <span className="builder-card-check">{selected ? <Check size={14} strokeWidth={2.8} aria-hidden="true" /> : <Plus size={14} strokeWidth={2.5} aria-hidden="true" />}</span>
                  </span>
                  <strong>{skill.name}</strong>
                  <small>{skill.summary}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="builder-column builder-column--wide">
          <div className="builder-section-heading">
            <span>SOP 编排</span>
            <strong>{selectedSopSteps.length} 步</strong>
          </div>
          <div className="builder-sop-list">
            {agentSopCatalog.map((step, index) => {
              const selected = config.selectedSopStepIds.includes(step.id);
              return (
                <button
                  className={`builder-sop-step ${selected ? "builder-sop-step--selected" : ""}`}
                  key={step.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleSopStep(step.id)}
                >
                  <span className="builder-sop-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="builder-sop-copy">
                    <strong>{step.title}</strong>
                    <small>{step.summary}</small>
                  </span>
                  <span className="builder-card-check">{selected ? <Check size={14} strokeWidth={2.8} aria-hidden="true" /> : <Plus size={14} strokeWidth={2.5} aria-hidden="true" />}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="builder-preview" aria-label="Agent 配置预览">
          <div className="builder-section-heading">
            <span>Agent 预览</span>
            <strong>本地草稿</strong>
          </div>

          <label className="builder-field">
            <span>Agent 名称</span>
            <input
              maxLength={36}
              value={config.name}
              onChange={(event) => onConfigChange({ ...config, name: event.currentTarget.value })}
            />
          </label>

          <label className="builder-field">
            <span>适用场景</span>
            <textarea
              maxLength={120}
              rows={4}
              value={config.scenario}
              onChange={(event) => onConfigChange({ ...config, scenario: event.currentTarget.value })}
            />
          </label>

          <div className="builder-preview-group">
            <span>已装配技能</span>
            <div className="builder-token-list">
              {selectedSkills.length > 0 ? selectedSkills.map((skill) => <strong key={skill.id}>{skill.name}</strong>) : <small>尚未选择 skill</small>}
            </div>
          </div>

          <div className="builder-preview-group">
            <span>SOP 流程</span>
            <ol className="builder-preview-steps">
              {selectedSopSteps.length > 0 ? (
                selectedSopSteps.map((step) => <li key={step.id}>{step.title}</li>)
              ) : (
                <li>尚未选择 SOP 步骤</li>
              )}
            </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}

function App() {
  const initialSettingsSection = typeof window === "undefined" ? null : settingsSectionFromHash(window.location.hash);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window === "undefined" ? "dark" : readStoredTheme(window.localStorage),
  );
  const [view, setView] = useState<AppView>(initialSettingsSection ? "settings" : "landing");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(initialSettingsSection ?? "profile");
  const [builderConfig, setBuilderConfig] = useState<AgentBuilderConfig>(() =>
    typeof window === "undefined" ? readAgentBuilderConfig(null) : readAgentBuilderConfig(window.localStorage),
  );
  const [downloadedSkillIds, setDownloadedSkillIds] = useState<string[]>(() =>
    typeof window === "undefined" ? readDownloadedSkillIds(null) : readDownloadedSkillIds(window.localStorage),
  );
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentProfileInput>(defaultAgentProfileInput);
  const [agentSaving, setAgentSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(defaultUserProfile);
  const [profileDraft, setProfileDraft] = useState<UserProfile>(profile);
  const [editingProfile, setEditingProfile] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
  const [isSessionBatchMode, setIsSessionBatchMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set());
  const [sessionSummaryTitles, setSessionSummaryTitles] = useState<SessionSummaryTitleMap>({});
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadataMap>(() =>
    typeof window === "undefined" ? {} : readSessionMetadata(window.localStorage),
  );
  const [error, setError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const streamingSessionIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSummary = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );
  const activeAgent = useMemo(() => agents.find((agent) => agent.id === activeAgentId) ?? null, [activeAgentId, agents]);
  const visibleSessions = useMemo(
    () => sortSessionsForSidebar(sessions, sessionMetadata).filter((session) => !isSessionHidden(session.id, sessionMetadata)),
    [sessionMetadata, sessions],
  );
  const selectedSessionCount = selectedSessionIds.size;
  const areAllVisibleSessionsSelected =
    visibleSessions.length > 0 && visibleSessions.every((session) => selectedSessionIds.has(session.id));
  const isBusy = loadState === "sending" || activeSummary?.busy === true;
  const canSend = Boolean(activeSessionId && draft.trim() && !isBusy);
  const messages = activeSession?.messages ?? [];
  const activeSessionSummaryTitle = activeSession ? summarizeSessionTitle(activeSession.messages) : null;
  const isSettingsView = view === "settings";
  const isAgentManagerView = view === "agents";
  const isBuilderView = view === "builder";
  const isLandingView = view === "landing";
  const activeWorkspaceTab: WorkspaceTab = view === "skills" || view === "builder" ? view : "chat";
  const conversationRuntimeState = loadState === "loading" ? "loading" : isBusy ? "running" : activeSessionId ? "completed" : "idle";

  function sessionTitleFor(session: SessionSummary | SessionDetail): string {
    const generatedTitle =
      activeSession?.id === session.id ? activeSessionSummaryTitle : sessionSummaryTitles[session.id] ?? null;
    return sessionDisplayTitle(session, sessionMetadata, generatedTitle);
  }

  async function refreshHealth(): Promise<void> {
    try {
      setHealth(await fetchHealth());
    } catch (err) {
      setHealth({ ok: false, connected: false, bffStatus: "error", agentStatus: "unavailable" });
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshSessions(selectFirst = false): Promise<void> {
    const next = sortSessionsByRecent(await fetchSessions());
    setSessions(next);
    const nextVisibleSessions = sortSessionsForSidebar(next, sessionMetadata).filter(
      (session) => !isSessionHidden(session.id, sessionMetadata),
    );
    const nextActiveSessionId = resolveActiveSessionId(activeSessionId, nextVisibleSessions);
    if (selectFirst && !activeSessionId && nextActiveSessionId) {
      setActiveSessionId(nextActiveSessionId);
    }
  }

  async function refreshProfile(): Promise<void> {
    const nextProfile = await fetchProfile();
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
  }

  async function refreshAgents(selectFirst = false): Promise<AgentProfile[]> {
    const nextAgents = await fetchAgents();
    setAgents(nextAgents);
    const nextActiveAgent = nextAgents.find((agent) => agent.id === activeAgentId) ?? (selectFirst ? nextAgents[0] ?? null : null);
    if (nextActiveAgent) {
      setActiveAgentId(nextActiveAgent.id);
      setAgentDraft(agentDraftFromProfile(nextActiveAgent));
    } else if (nextAgents.length === 0) {
      setActiveAgentId(null);
      setAgentDraft(defaultAgentProfileInput);
    }
    return nextAgents;
  }

  async function loadSession(sessionId: string, options: { silent?: boolean } = {}): Promise<void> {
    if (!options.silent) {
      setLoadState("loading");
    }
    try {
      const detail = await fetchSession(sessionId);
      const generatedTitle = summarizeSessionTitle(detail.messages);
      setActiveSession(detail);
      if (generatedTitle) {
        setSessionSummaryTitles((current) => ({ ...current, [detail.id]: generatedTitle }));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!options.silent) {
        setLoadState("idle");
      }
    }
  }

  async function bootstrap(): Promise<void> {
    setLoadState("loading");
    try {
      await Promise.all([refreshHealth(), refreshProfile(), refreshAgents(true), refreshSessions(true)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadState("idle");
    }
  }

  async function handleCreateSession(): Promise<void> {
    exitSessionBatchMode();
    setView("chat");
    setLoadState("loading");
    try {
      const session = await createSession();
      await refreshSessions();
      setActiveSessionId(session.id);
      setActiveSession({ ...session, messages: [] });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadState("idle");
    }
  }

  async function sendDraft(): Promise<void> {
    if (!activeSessionId || !draft.trim() || isBusy) {
      return;
    }
    const message = draft.trim();
    const targetSessionId = activeSessionId;
    setDraft("");
    setLoadState("sending");
    streamingSessionIdRef.current = targetSessionId;
    setActiveSession((session) =>
      session
        ? {
            ...session,
            messages: [...session.messages, { role: "user", content: message }, { role: "assistant", content: "", name: "streaming" }],
          }
        : session,
    );
    try {
      await sendSessionMessageStream(activeSessionId, message, (event) => {
        if (event.type === "message.delta") {
          const delta = event.data.delta ?? "";
          if (!delta) {
            return;
          }
          setActiveSession((session) =>
            session
              ? {
                  ...session,
                  messages: session.messages.map((item, index) =>
                    index === session.messages.length - 1 && item.role === "assistant"
                      ? { role: "assistant", content: `${item.content ?? ""}${delta}` }
                      : item,
                  ),
                }
              : session,
          );
        }
        if (event.type === "message.done" && event.data.assistant) {
          const assistant = event.data.assistant;
          setActiveSession((session) =>
            session
              ? {
                  ...session,
                  messages: session.messages.map((item, index) =>
                    index === session.messages.length - 1 && item.role === "assistant"
                      ? { role: "assistant", content: assistant }
                      : item,
                  ),
                }
              : session,
          );
        }
        if (event.type === "message.error") {
          throw new Error(event.data.message ?? "message stream failed");
        }
      });
      await Promise.all([refreshSessions(), loadSession(activeSessionId)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (streamingSessionIdRef.current === targetSessionId) {
        streamingSessionIdRef.current = null;
      }
      setLoadState("idle");
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await sendDraft();
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void sendDraft();
      return;
    }
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  }

  function handleThemeToggle(): void {
    setTheme((current) => {
      const next = getNextTheme(current);
      writeStoredTheme(window.localStorage, next);
      return next;
    });
  }

  function openSettings(section: SettingsSection): void {
    setSettingsSection(section);
    setView("settings");
    window.location.hash = `settings/${section}`;
  }

  function backToChat(): void {
    setView("chat");
    if (window.location.hash.startsWith("#settings")) {
      window.history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  }

  function updateBuilderConfig(config: AgentBuilderConfig): void {
    setBuilderConfig(config);
    writeAgentBuilderConfig(window.localStorage, config);
  }

  function toggleDownloadedSkill(skillId: string): void {
    setDownloadedSkillIds((current) => {
      const next = toggleAgentBuilderId(
        current,
        skillId,
        agentSkillCatalog.map((skill) => skill.id),
      );
      writeDownloadedSkillIds(window.localStorage, next);
      return next;
    });
  }

  function toggleProfileEdit(): void {
    setProfileDraft(profile);
    setEditingProfile((current) => !current);
  }

  function cancelProfileEdit(): void {
    setProfileDraft(profile);
    setEditingProfile(false);
  }

  async function saveProfile(): Promise<void> {
    try {
      const nextProfile = await updateProfile(profileDraft);
      setProfile(nextProfile);
      setProfileDraft(nextProfile);
      setEditingProfile(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function selectAgent(agent: AgentProfile): void {
    setActiveAgentId(agent.id);
    setAgentDraft(agentDraftFromProfile(agent));
  }

  async function handleCreateAgent(): Promise<void> {
    setAgentSaving(true);
    try {
      const agent = await createAgentProfile({ name: `新 Agent ${agents.length + 1}` });
      setAgents((current) => [agent, ...current.filter((item) => item.id !== agent.id)]);
      setActiveAgentId(agent.id);
      setAgentDraft(agentDraftFromProfile(agent));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentSaving(false);
    }
  }

  async function handleSaveAgent(): Promise<void> {
    if (!activeAgent) {
      return;
    }
    setAgentSaving(true);
    try {
      const agent = await updateAgentProfile(activeAgent.id, agentDraft);
      setAgents((current) => current.map((item) => (item.id === agent.id ? agent : item)));
      setAgentDraft(agentDraftFromProfile(agent));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentSaving(false);
    }
  }

  async function handleDeleteAgent(agent: AgentProfile): Promise<void> {
    setAgentSaving(true);
    try {
      await deleteAgentProfile(agent.id);
      const nextAgents = agents.filter((item) => item.id !== agent.id);
      setAgents(nextAgents);
      const nextAgent = nextAgents[0] ?? null;
      setActiveAgentId(nextAgent?.id ?? null);
      setAgentDraft(nextAgent ? agentDraftFromProfile(nextAgent) : defaultAgentProfileInput);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentSaving(false);
    }
  }

  function handleTestAgent(agent: AgentProfile): void {
    setActiveAgentId(agent.id);
    setView("chat");
  }

  function updateMetadata(updater: (current: SessionMetadataMap) => SessionMetadataMap): void {
    setSessionMetadata((current) => {
      const next = updater(current);
      writeSessionMetadata(window.localStorage, next);
      return next;
    });
  }

  function exitSessionBatchMode(): void {
    setIsSessionBatchMode(false);
    setSelectedSessionIds(new Set());
  }

  function toggleSessionBatchMode(): void {
    setOpenSessionMenuId(null);
    if (isSessionBatchMode) {
      exitSessionBatchMode();
      return;
    }
    setIsSessionBatchMode(true);
  }

  function toggleSessionSelection(sessionId: string): void {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }

  function selectAllVisibleSessions(): void {
    setSelectedSessionIds(new Set(visibleSessions.map((session) => session.id)));
  }

  function clearSelectedSessions(): void {
    setSelectedSessionIds(new Set());
  }

  function handleBatchHideSessions(): void {
    if (selectedSessionIds.size === 0) {
      return;
    }
    const hiddenIds = new Set(selectedSessionIds);
    updateMetadata((current) => hideSessions(current, hiddenIds));
    if (activeSessionId && hiddenIds.has(activeSessionId)) {
      const nextSession = visibleSessions.find((item) => !hiddenIds.has(item.id)) ?? null;
      setActiveSessionId(nextSession?.id ?? null);
      setActiveSession(null);
    }
    exitSessionBatchMode();
  }

  function handleRenameSession(session: SessionSummary): void {
    setOpenSessionMenuId(null);
    const currentTitle = sessionTitleFor(session);
    const nextTitle = window.prompt("重命名会话", currentTitle);
    if (nextTitle === null) {
      return;
    }
    updateMetadata((current) => renameSession(current, session.id, nextTitle));
  }

  function handleTogglePinned(session: SessionSummary): void {
    setOpenSessionMenuId(null);
    updateMetadata((current) => toggleSessionPinned(current, session.id));
  }

  function handleHideSession(session: SessionSummary): void {
    setOpenSessionMenuId(null);
    updateMetadata((current) => hideSession(current, session.id));
    if (activeSessionId === session.id) {
      const nextSession = visibleSessions.find((item) => item.id !== session.id) ?? null;
      setActiveSessionId(nextSession?.id ?? null);
      setActiveSession(null);
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    function handleHashChange(): void {
      const nextSection = settingsSectionFromHash(window.location.hash);
      if (nextSection) {
        setSettingsSection(nextSection);
        setView("settings");
        return;
      }
      setView((current) => (current === "settings" ? "chat" : current));
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    setStreamState("connecting");
    try {
      const stream = createAgentEventStream({
        onOpen: () => setStreamState("connected"),
        onError: () => setStreamState("disconnected"),
        onEvent: () => {
          void refreshSessions();
          const currentSessionId = activeSessionIdRef.current;
          if (
            shouldReloadSessionFromAgentEvent({
              activeSessionId: currentSessionId,
              streamingSessionId: streamingSessionIdRef.current,
            })
          ) {
            void loadSession(currentSessionId, { silent: true });
          }
        },
      });
      return () => stream.close();
    } catch {
      setStreamState("disconnected");
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      void loadSession(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    const nextActiveSessionId = resolveActiveSessionId(activeSessionId, visibleSessions);
    if (nextActiveSessionId === activeSessionId) {
      return;
    }
    setActiveSessionId(nextActiveSessionId);
    setActiveSession(null);
  }, [activeSessionId, visibleSessions]);

  useEffect(() => {
    const sessionsNeedingTitle = sessions.filter(
      (session) =>
        session.messageCount > 0 &&
        !sessionMetadata[session.id]?.title &&
        !sessionSummaryTitles[session.id] &&
        activeSession?.id !== session.id,
    );
    if (sessionsNeedingTitle.length === 0) {
      return undefined;
    }
    let cancelled = false;
    void Promise.all(
      sessionsNeedingTitle.map(async (session) => {
        try {
          const detail = await fetchSession(session.id);
          const title = summarizeSessionTitle(detail.messages);
          return title ? [session.id, title] : null;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      const nextEntries = entries.filter((entry): entry is [string, string] => Boolean(entry));
      if (nextEntries.length === 0) {
        return;
      }
      setSessionSummaryTitles((current) => ({ ...current, ...Object.fromEntries(nextEntries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeSession?.id, sessionMetadata, sessionSummaryTitles, sessions]);

  useEffect(() => {
    if (visibleSessions.length === 0) {
      exitSessionBatchMode();
      return;
    }
    const visibleSessionIds = new Set(visibleSessions.map((session) => session.id));
    setSelectedSessionIds((current) => {
      const next = new Set([...current].filter((sessionId) => visibleSessionIds.has(sessionId)));
      return next.size === current.size ? current : next;
    });
  }, [visibleSessions]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  if (isLandingView) {
    return <LandingPage onStart={() => setView("agents")} />;
  }

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell--sidebar-collapsed" : ""} ${isSettingsView || isAgentManagerView ? "app-shell--settings" : ""}`}>
      {!isSettingsView && !isAgentManagerView ? (
        <aside className="sidebar" aria-hidden={isSidebarCollapsed} aria-label="本地控制台导航">
          <div className="profile-row">
            <div className="brand-mark" aria-hidden="true">
              <BrainCircuit size={21} strokeWidth={2.4} />
            </div>
            <strong>AI Studio</strong>
          </div>

          <nav className="primary-nav" aria-label="功能导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className="nav-item nav-item--pending"
                  key={item.label}
                  type="button"
                  aria-label={`${item.label}，待开发`}
                >
                  <Icon className="nav-icon" size={18} strokeWidth={2} aria-hidden="true" />
                  <span>{item.label}</span>
                  <span className="pending-badge">待开发</span>
                </button>
              );
            })}
          </nav>

          <div className={`history-section ${isSessionBatchMode ? "history-section--batch" : ""}`}>
            <div className="history-header">
              <span>历史对话</span>
              <span className="history-header-actions">
                <button
                  className={`icon-button history-batch-button ${isSessionBatchMode ? "history-batch-button--active" : ""}`}
                  type="button"
                  onClick={toggleSessionBatchMode}
                  aria-pressed={isSessionBatchMode}
                  aria-label={isSessionBatchMode ? "退出批量操作" : "批量操作"}
                  title={isSessionBatchMode ? "退出批量操作" : "批量操作"}
                  disabled={visibleSessions.length === 0}
                >
                  {isSessionBatchMode ? (
                    <X size={18} strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <SlidersHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
                  )}
                </button>
                <button className="icon-button" type="button" onClick={() => void handleCreateSession()} aria-label="新建会话">
                  <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            </div>

            {isSessionBatchMode ? (
              <div className="history-batch-bar" aria-label="批量操作">
                <span>{selectedSessionCount} 已选</span>
                <button type="button" onClick={areAllVisibleSessionsSelected ? clearSelectedSessions : selectAllVisibleSessions}>
                  {areAllVisibleSessionsSelected ? "取消全选" : "全选"}
                </button>
                <button
                  className="history-batch-danger"
                  type="button"
                  onClick={handleBatchHideSessions}
                  disabled={selectedSessionCount === 0}
                >
                  <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>删除</span>
                </button>
              </div>
            ) : null}

            <div className="session-list">
              {visibleSessions.length === 0 ? (
                <div className="history-empty">暂无会话</div>
              ) : (
                visibleSessions.map((session) => (
                  <div
                    className={`session-item ${session.id === activeSessionId ? "session-item--active" : ""} ${
                      isSessionBatchMode && selectedSessionIds.has(session.id) ? "session-item--selected" : ""
                    }`}
                    key={session.id}
                  >
                    <button
                      className="session-select"
                      type="button"
                      onClick={() => {
                        if (isSessionBatchMode) {
                          toggleSessionSelection(session.id);
                          return;
                        }
                        setView("chat");
                        setActiveSessionId(session.id);
                      }}
                      aria-pressed={isSessionBatchMode ? selectedSessionIds.has(session.id) : undefined}
                    >
                      <span className="session-dot" aria-hidden="true">
                        {isSessionBatchMode && selectedSessionIds.has(session.id) ? (
                          <Check size={12} strokeWidth={3} aria-hidden="true" />
                        ) : null}
                      </span>
                      <span className="session-copy">
                        <strong>
                          {sessionMetadata[session.id]?.pinned ? "置顶 " : ""}
                          {sessionTitleFor(session)}
                        </strong>
                        <small>
                          {session.messageCount} 条消息 · {session.busy ? "运行中" : formatTime(session.updatedAt)}
                        </small>
                      </span>
                    </button>
                    {!isSessionBatchMode ? (
                      <span className="session-actions">
                        <button
                          aria-expanded={openSessionMenuId === session.id}
                          aria-label="打开会话菜单"
                          className="session-menu-trigger"
                          type="button"
                          title="会话菜单"
                          onClick={() => setOpenSessionMenuId((current) => (current === session.id ? null : session.id))}
                        >
                          <MoreVertical size={17} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                        {openSessionMenuId === session.id ? (
                          <span className="session-menu" role="menu">
                            <button className="session-menu-item" role="menuitem" type="button" onClick={() => handleTogglePinned(session)}>
                              <Pin
                                className={sessionMetadata[session.id]?.pinned ? "session-menu-item-icon--active" : ""}
                                size={15}
                                strokeWidth={2.2}
                                aria-hidden="true"
                              />
                              <span>{sessionMetadata[session.id]?.pinned ? "取消置顶" : "置顶"}</span>
                            </button>
                            <button className="session-menu-item" role="menuitem" type="button" onClick={() => handleRenameSession(session)}>
                              <Pencil size={15} strokeWidth={2.2} aria-hidden="true" />
                              <span>重命名</span>
                            </button>
                            <button
                              className="session-menu-item session-menu-item--danger"
                              role="menuitem"
                              type="button"
                              onClick={() => handleHideSession(session)}
                            >
                              <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                              <span>删除</span>
                            </button>
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="sidebar-settings" aria-label="个人设置">
            {sidebarSettings.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className="sidebar-setting-button"
                  key={item.label}
                  type="button"
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => openSettings(item.section)}
                >
                  <Icon size={18} strokeWidth={2.1} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </aside>
      ) : null}

      {isSettingsView ? (
        <SettingsPage
          activeSection={settingsSection}
          health={health}
          sessionCount={sessions.length}
          streamState={streamState}
          theme={theme}
          editingProfile={editingProfile}
          profile={profile}
          profileDraft={profileDraft}
          onBack={backToChat}
          onCancelProfileEdit={cancelProfileEdit}
          onProfileDraftChange={setProfileDraft}
          onSaveProfile={() => void saveProfile()}
          onSectionChange={setSettingsSection}
          onToggleProfileEdit={toggleProfileEdit}
          onThemeToggle={handleThemeToggle}
        />
      ) : isAgentManagerView ? (
        <AgentManagerPage
          agents={agents}
          activeAgent={activeAgent}
          draft={agentDraft}
          loading={loadState === "loading"}
          saving={agentSaving}
          onCreateAgent={() => void handleCreateAgent()}
          onDeleteAgent={(agent) => void handleDeleteAgent(agent)}
          onDraftChange={setAgentDraft}
          onRefresh={() => void refreshAgents(true)}
          onSaveAgent={() => void handleSaveAgent()}
          onSelectAgent={selectAgent}
          onTestAgent={handleTestAgent}
        />
      ) : (
        <section className="workspace-shell">
          <main className={`chat-shell ${activeAgent ? "chat-shell--with-agent" : ""} ${error ? "chat-shell--has-error" : ""}`}>
          <header className="conversation-header">
            <button
              aria-expanded={!isSidebarCollapsed}
              aria-label={isSidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
              className="icon-button header-icon"
              type="button"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen size={20} strokeWidth={2.1} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={20} strokeWidth={2.1} aria-hidden="true" />
              )}
            </button>
            <div className="conversation-title">
              <h1>{activeSession ? sessionTitleFor(activeSession) : "AI Studio"}</h1>
              <span className={`conversation-state conversation-state--${conversationRuntimeState}`}>
                {conversationRuntimeState}
              </span>
            </div>
            <div className="header-actions">
              <span className="stream-indicator" title={streamLabel(streamState)}>
                <Radio className={`stream-icon stream-icon--${streamState}`} size={18} strokeWidth={2.2} aria-hidden="true" />
                <span className="sr-only">{streamLabel(streamState)}</span>
              </span>
              <button className="icon-button" type="button" onClick={() => void bootstrap()} aria-label="刷新连接与会话">
                <RefreshCw size={19} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </header>

          {error ? (
            <div className="error-toast" role="alert">
              <strong>请求失败</strong>
              <span>{error}</span>
              <button type="button" onClick={() => void bootstrap()}>
                重试
              </button>
            </div>
          ) : null}

          <AgentTestBanner agent={activeAgent} onBack={() => setView("agents")} />

          <section className="transcript" aria-label="聊天内容">
            {!activeSessionId ? (
              <NewConversationPanel onCreate={() => void handleCreateSession()} />
            ) : messages.length === 0 ? (
              <NewConversationPanel />
            ) : (
              messages.map((message, index) => {
                const isUserMessage = message.role === "user";
                return (
                  <article className={`message-row message-row--${message.role}`} key={`${message.role}-${index}`}>
                    {isUserMessage ? null : <MessageAvatar role={message.role} />}
                    <div className="message-stack">
                      <div className="message-meta">
                        <strong>{roleLabel(message.role)}</strong>
                        {message.name && message.name !== "streaming" ? <span>{message.name}</span> : null}
                      </div>
                      <div className="message-content">
                        <MessageBody message={message} />
                      </div>
                    </div>
                    {isUserMessage ? <MessageAvatar role={message.role} /> : null}
                  </article>
                );
              })
            )}
          </section>

          <form className="composer" onSubmit={(event) => void handleSend(event)}>
            <label className="sr-only" htmlFor="message-input">
              消息
            </label>
            <textarea
              ref={textareaRef}
              id="message-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={activeSessionId ? "发送消息..." : "先新建一个会话..."}
              disabled={!activeSessionId || isBusy}
              rows={3}
            />
            <div className="composer-toolbar">
              <div className="quick-actions" aria-label="快捷操作">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button className="quick-action" key={action.label} type="button" aria-label={action.label} title={action.label}>
                      <Icon size={18} strokeWidth={2.1} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              <div className="composer-shortcuts" aria-label="快捷键">
                {shortcutHints.map((shortcut) => (
                  <kbd key={shortcut}>{shortcut}</kbd>
                ))}
              </div>
              <button className="send-button" type="submit" disabled={!canSend} aria-label="发送消息">
                <SendHorizontal size={20} strokeWidth={2.3} aria-hidden="true" />
              </button>
            </div>
          </form>
            </main>
        </section>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
