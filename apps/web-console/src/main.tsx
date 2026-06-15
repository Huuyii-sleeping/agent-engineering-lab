import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  AppWindow,
  Bot,
  BrainCircuit,
  CircleDot,
  Code2,
  Folder,
  Grid2X2,
  Image,
  Moon,
  MoreHorizontal,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PenTool,
  Pin,
  Plus,
  Radio,
  RefreshCw,
  SearchCheck,
  SendHorizontal,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import rehypeHighlight from "rehype-highlight";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createAgentEventStream,
  createSession,
  fetchHealth,
  fetchSession,
  fetchSessions,
  sendSessionMessageStream,
  type ChatMessage,
  type HealthStatus,
  type SessionDetail,
  type SessionSummary,
} from "./api";
import {
  hideSession,
  isSessionHidden,
  readSessionMetadata,
  renameSession,
  sessionDisplayTitle,
  summarizeSessionTitle,
  toggleSessionPinned,
  writeSessionMetadata,
  type SessionMetadataMap,
} from "./session-metadata";
import { getNextTheme, readStoredTheme, writeStoredTheme, type ThemeMode } from "./theme";
import "./styles.css";

type LoadState = "idle" | "loading" | "sending";
type StreamState = "connecting" | "connected" | "disconnected";

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
  { label: "个人设置", icon: UserRound },
  { label: "偏好设置", icon: SlidersHorizontal },
  { label: "系统设置", icon: Settings },
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

function App() {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window === "undefined" ? "dark" : readStoredTheme(window.localStorage),
  );
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
  const [sessionSummaryTitles, setSessionSummaryTitles] = useState<SessionSummaryTitleMap>({});
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadataMap>(() =>
    typeof window === "undefined" ? {} : readSessionMetadata(window.localStorage),
  );
  const [error, setError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSummary = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );
  const visibleSessions = useMemo(
    () => sortSessionsForSidebar(sessions, sessionMetadata).filter((session) => !isSessionHidden(session.id, sessionMetadata)),
    [sessionMetadata, sessions],
  );
  const isBusy = loadState === "sending" || activeSummary?.busy === true;
  const canSend = Boolean(activeSessionId && draft.trim() && !isBusy);
  const messages = activeSession?.messages ?? [];
  const activeSessionSummaryTitle = activeSession ? summarizeSessionTitle(activeSession.messages) : null;
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
      await refreshHealth();
      await refreshSessions(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadState("idle");
    }
  }

  async function handleCreateSession(): Promise<void> {
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
    setDraft("");
    setLoadState("sending");
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

  function updateMetadata(updater: (current: SessionMetadataMap) => SessionMetadataMap): void {
    setSessionMetadata((current) => {
      const next = updater(current);
      writeSessionMetadata(window.localStorage, next);
      return next;
    });
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
    setStreamState("connecting");
    try {
      const stream = createAgentEventStream({
        onOpen: () => setStreamState("connected"),
        onError: () => setStreamState("disconnected"),
        onEvent: () => {
          void refreshSessions();
          const currentSessionId = activeSessionIdRef.current;
          if (currentSessionId) {
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
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
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

        <div className="history-section">
          <div className="history-header">
            <span>历史对话</span>
            <button className="icon-button" type="button" onClick={() => void handleCreateSession()} aria-label="新建会话">
              <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          <div className="session-list">
            {visibleSessions.length === 0 ? (
              <div className="history-empty">暂无会话</div>
            ) : (
              visibleSessions.map((session) => (
                <div
                  className={`session-item ${session.id === activeSessionId ? "session-item--active" : ""}`}
                  key={session.id}
                >
                  <button className="session-select" type="button" onClick={() => setActiveSessionId(session.id)}>
                    <span className="session-dot" aria-hidden="true" />
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
                        <button className="session-menu-item session-menu-item--danger" role="menuitem" type="button" onClick={() => handleHideSession(session)}>
                          <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                          <span>删除</span>
                        </button>
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-settings" aria-label="个人设置">
          {sidebarSettings.map((item) => {
            const Icon = item.icon;
            return (
              <button className="sidebar-setting-button" key={item.label} type="button" aria-label={item.label} title={item.label}>
                <Icon size={18} strokeWidth={2.1} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </aside>

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
            <button
              className="theme-toggle"
              type="button"
              onClick={handleThemeToggle}
              aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            >
              {theme === "dark" ? (
                <Sun size={18} strokeWidth={2.1} aria-hidden="true" />
              ) : (
                <Moon size={18} strokeWidth={2.1} aria-hidden="true" />
              )}
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
