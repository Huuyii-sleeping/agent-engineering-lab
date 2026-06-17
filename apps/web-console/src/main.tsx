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
  createAgentEventStream,
  createSession,
  fetchHealth,
  fetchProfile,
  fetchSession,
  fetchSessions,
  sendSessionMessageStream,
  updateProfile,
  defaultUserProfile,
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
import { settingsSectionFromHash, type SettingsSection } from "./settings-route";
import { getNextTheme, readStoredTheme, writeStoredTheme, type ThemeMode } from "./theme";
import "./styles.css";

type LoadState = "idle" | "loading" | "sending";
type StreamState = "connecting" | "connected" | "disconnected";
type AppView = "chat" | "settings";

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

function App() {
  const initialSettingsSection = typeof window === "undefined" ? null : settingsSectionFromHash(window.location.hash);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window === "undefined" ? "dark" : readStoredTheme(window.localStorage),
  );
  const [view, setView] = useState<AppView>(initialSettingsSection ? "settings" : "chat");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(initialSettingsSection ?? "profile");
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
    if (selectFirst && !activeSessionId && next[0]) {
      setActiveSessionId(next[0].id);
    }
  }

  async function refreshProfile(): Promise<void> {
    const nextProfile = await fetchProfile();
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
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
      await Promise.all([refreshHealth(), refreshProfile(), refreshSessions(true)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadState("idle");
    }
  }

  async function handleCreateSession(): Promise<void> {
    exitSessionBatchMode();
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
      setView("chat");
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

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell--sidebar-collapsed" : ""} ${isSettingsView ? "app-shell--settings" : ""}`}>
      {!isSettingsView ? (
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
                <button className="nav-item nav-item--pending" key={item.label} type="button" aria-label={`${item.label}，待开发`}>
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
      ) : (
        <main className={`chat-shell ${error ? "chat-shell--has-error" : ""}`}>
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
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
