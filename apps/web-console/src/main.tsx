import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createAgentEventStream,
  createSession,
  fetchHealth,
  fetchSession,
  fetchSessions,
  sendSessionMessage,
  type ChatMessage,
  type HealthStatus,
  type SessionDetail,
  type SessionSummary,
} from "./api";
import { getNextTheme, readStoredTheme, writeStoredTheme, type ThemeMode } from "./theme";
import "./styles.css";

type LoadState = "idle" | "loading" | "sending";
type StreamState = "connecting" | "connected" | "disconnected";

type NavItem = {
  label: string;
  icon: string;
};

type QuickAction = {
  label: string;
  icon: string;
};

const navItems: NavItem[] = [
  { label: "AI 浏览器", icon: "browser" },
  { label: "应用生成", icon: "code" },
  { label: "AI 创作", icon: "pen" },
  { label: "云盘", icon: "folder" },
  { label: "更多", icon: "grid" },
];

const quickActions: QuickAction[] = [
  { label: "快速", icon: "spark" },
  { label: "帮我写作", icon: "write" },
  { label: "图像生成", icon: "image" },
  { label: "编程", icon: "code" },
  { label: "更多", icon: "more" },
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
    return "Agent";
  }
  if (role === "user") {
    return "我";
  }
  if (role === "tool") {
    return "工具";
  }
  return "系统";
}

function sessionTitle(session: SessionSummary | SessionDetail): string {
  return session.id.slice(0, 8);
}

function sessionTimestamp(session: SessionSummary): number {
  return session.updatedAt ?? session.createdAt ?? 0;
}

function sortSessionsByRecent(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((left, right) => sessionTimestamp(right) - sessionTimestamp(left));
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

function StatusPill({ health, loading }: { health: HealthStatus | null; loading: boolean }) {
  const connected = health?.connected === true;
  return (
    <span className={`status-pill ${connected ? "status-pill--ok" : "status-pill--down"}`}>
      <span className="status-dot" />
      {loading ? "连接中" : connected ? "已连接" : "未连接"}
    </span>
  );
}

function MessageBody({ message }: { message: ChatMessage }) {
  const content = messageText(message);
  if (message.role === "user") {
    return <p>{content}</p>;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
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
  const [lastStreamEvent, setLastStreamEvent] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const activeSummary = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );
  const isBusy = loadState === "sending" || activeSummary?.busy === true;
  const canSend = Boolean(activeSessionId && draft.trim() && !isBusy);
  const messages = activeSession?.messages ?? [];

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
      setActiveSession(await fetchSession(sessionId));
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

  async function handleSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
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
            messages: [...session.messages, { role: "user", content: message }],
          }
        : session,
    );
    try {
      const result = await sendSessionMessage(activeSessionId, message);
      if (!result.ok) {
        throw new Error(result.error?.message ?? "message request failed");
      }
      await Promise.all([refreshSessions(), loadSession(activeSessionId)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadState("idle");
    }
  }

  function handleThemeToggle(): void {
    setTheme((current) => {
      const next = getNextTheme(current);
      writeStoredTheme(window.localStorage, next);
      return next;
    });
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
        onEvent: (event) => {
          setLastStreamEvent(event.type);
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

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
      <aside className="sidebar" aria-hidden={isSidebarCollapsed} aria-label="本地控制台导航">
        <div className="profile-row">
          <div className="avatar" aria-hidden="true">
            A
          </div>
          <strong>Agent</strong>
        </div>

        <nav className="primary-nav" aria-label="功能导航">
          {navItems.map((item) => (
            <button className="nav-item" key={item.label} type="button">
              <span className={`nav-icon nav-icon--${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="history-section">
          <div className="history-header">
            <span>历史对话</span>
            <button className="icon-button" type="button" onClick={() => void handleCreateSession()} aria-label="新建会话">
              <span className="plus-icon" aria-hidden="true" />
            </button>
          </div>

          <div className="session-list">
            {sessions.length === 0 ? (
              <div className="history-empty">暂无会话</div>
            ) : (
              sessions.map((session) => (
                <button
                  className={`session-item ${session.id === activeSessionId ? "session-item--active" : ""}`}
                  key={session.id}
                  type="button"
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <span className="session-dot" aria-hidden="true" />
                  <span className="session-copy">
                    <strong>Agent 会话 {sessionTitle(session)}</strong>
                    <small>
                      {session.messageCount} 条消息 · {session.busy ? "运行中" : formatTime(session.updatedAt)}
                    </small>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <span>BFF: {health?.bffStatus ?? "unknown"}</span>
          <StatusPill health={health} loading={loadState === "loading" && !health} />
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
            <span className="panel-icon" aria-hidden="true" />
          </button>
          <div className="conversation-title">
            <h1>{activeSession ? `Agent 会话 ${sessionTitle(activeSession)}` : "Agent Chat Console"}</h1>
            <span>{lastStreamEvent ?? (activeSession ? `${activeSession.messageCount} 条消息` : "本地开发控制台")}</span>
          </div>
          <div className="header-actions">
            <span className="stream-indicator" title={streamLabel(streamState)}>
              <span className={`stream-icon stream-icon--${streamState}`} aria-hidden="true" />
              <span className="sr-only">{streamLabel(streamState)}</span>
            </span>
            <button className="icon-button" type="button" onClick={() => void bootstrap()} aria-label="刷新连接与会话">
              <span className="refresh-icon" aria-hidden="true" />
            </button>
            <button
              className="theme-toggle"
              type="button"
              onClick={handleThemeToggle}
              aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            >
              <span className={`theme-icon theme-icon--${theme === "dark" ? "sun" : "moon"}`} aria-hidden="true" />
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
            <div className="starter-panel">
              <h2>开始一个本地 Agent 会话</h2>
              <p>创建会话后，可以在这里继续 agent 的核心工作流。</p>
              <button className="primary-action" type="button" onClick={() => void handleCreateSession()}>
                新建会话
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="starter-panel">
              <h2>会话已就绪</h2>
              <p>输入下一条消息，BFF 会把请求转发到本地 agent service。</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <article className={`message-row message-row--${message.role}`} key={`${message.role}-${index}`}>
                {message.role !== "user" ? (
                  <div className="message-avatar" aria-hidden="true">
                    A
                  </div>
                ) : null}
                <div className="message-content">
                  <div className="message-meta">
                    <strong>{roleLabel(message.role)}</strong>
                    {message.name ? <span>{message.name}</span> : null}
                  </div>
                  <MessageBody message={message} />
                </div>
              </article>
            ))
          )}

          {loadState === "sending" ? (
            <article className="message-row message-row--assistant">
              <div className="message-avatar" aria-hidden="true">
                A
              </div>
              <div className="message-content message-content--pending">
                <div className="message-meta">
                  <strong>Agent</strong>
                  <span>运行中</span>
                </div>
                <p>正在等待本地 agent 返回结果...</p>
              </div>
            </article>
          ) : null}
        </section>

        <form className="composer" onSubmit={(event) => void handleSend(event)}>
          <label className="sr-only" htmlFor="message-input">
            消息
          </label>
          <textarea
            id="message-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={activeSessionId ? "发送消息或输入 / 选择技能" : "先新建一个会话..."}
            disabled={!activeSessionId || isBusy}
            rows={3}
          />
          <div className="composer-toolbar">
            <div className="quick-actions" aria-label="快捷操作">
              {quickActions.map((action) => (
                <button className="quick-action" key={action.label} type="button" aria-label={action.label} title={action.label}>
                  <span className={`quick-icon quick-icon--${action.icon}`} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button className="send-button" type="submit" disabled={!canSend} aria-label="发送消息">
              <span className="send-icon" aria-hidden="true" />
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
