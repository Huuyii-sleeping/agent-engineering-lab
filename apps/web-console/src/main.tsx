import React, { FormEvent, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
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
import "./styles.css";

type LoadState = "idle" | "loading" | "sending";

function formatTime(value: number | null): string {
  if (!value) {
    return "not recorded";
  }
  return new Intl.DateTimeFormat(undefined, {
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
  return message.role === "assistant" ? "(empty assistant response)" : "(empty message)";
}

function roleLabel(role: ChatMessage["role"]): string {
  if (role === "assistant") {
    return "Agent";
  }
  if (role === "user") {
    return "You";
  }
  return role;
}

function sessionTitle(session: SessionSummary): string {
  return session.id.slice(0, 8);
}

function StatusPill({ health, loading }: { health: HealthStatus | null; loading: boolean }) {
  const connected = health?.connected === true;
  return (
    <div className={`status-pill ${connected ? "status-pill--ok" : "status-pill--down"}`}>
      <span className="status-dot" />
      <span>{loading ? "Checking" : connected ? "Connected" : "Disconnected"}</span>
    </div>
  );
}

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const activeSummary = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );
  const isBusy = loadState === "sending" || activeSummary?.busy === true;
  const canSend = Boolean(activeSessionId && draft.trim() && !isBusy);

  async function refreshHealth(): Promise<void> {
    try {
      setHealth(await fetchHealth());
    } catch (err) {
      setHealth({ ok: false, connected: false, bffStatus: "error", agentStatus: "unavailable" });
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshSessions(selectFirst = false): Promise<void> {
    const next = await fetchSessions();
    setSessions(next);
    if (selectFirst && !activeSessionId && next[0]) {
      setActiveSessionId(next[0].id);
    }
  }

  async function loadSession(sessionId: string): Promise<void> {
    setLoadState("loading");
    try {
      setActiveSession(await fetchSession(sessionId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadState("idle");
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

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      void loadSession(activeSessionId);
    }
  }, [activeSessionId]);

  const messages = activeSession?.messages ?? [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local Agent Console</p>
          <h1>Chat</h1>
        </div>
        <div className="topbar-actions">
          <StatusPill health={health} loading={loadState === "loading" && !health} />
          <button className="button button--secondary" type="button" onClick={() => void bootstrap()}>
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          <strong>Request failed</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <main className="workspace">
        <aside className="session-pane" aria-label="Sessions">
          <div className="pane-header">
            <div>
              <h2>Sessions</h2>
              <span>{sessions.length} total</span>
            </div>
            <button className="button button--primary" type="button" onClick={() => void handleCreateSession()}>
              New
            </button>
          </div>
          <div className="session-list">
            {sessions.length === 0 ? (
              <div className="empty-block">
                <strong>No sessions yet</strong>
                <span>Create one to start chatting with the local agent.</span>
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  className={`session-item ${session.id === activeSessionId ? "session-item--active" : ""}`}
                  key={session.id}
                  type="button"
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <span className="session-name">{sessionTitle(session)}</span>
                  <span>{session.messageCount} messages</span>
                  <small>{session.busy ? "busy" : formatTime(session.updatedAt)}</small>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="chat-pane" aria-label="Chat transcript">
          <div className="chat-header">
            <div>
              <h2>{activeSession ? `Session ${sessionTitle(activeSession)}` : "No session selected"}</h2>
              <span>{activeSession ? `${activeSession.messageCount} messages` : "Create or select a session"}</span>
            </div>
            {isBusy ? <span className="busy-badge">Running</span> : null}
          </div>

          <div className="messages">
            {!activeSessionId ? (
              <div className="empty-chat">
                <h3>Start a local agent session</h3>
                <p>Create a session, then send a message through the BFF-backed chat workflow.</p>
                <button className="button button--primary" type="button" onClick={() => void handleCreateSession()}>
                  Create session
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="empty-chat">
                <h3>Session is ready</h3>
                <p>Ask the agent to inspect code, run tools, or continue your local development task.</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <article className={`message message--${message.role}`} key={`${message.role}-${index}`}>
                  <div className="message-meta">
                    <strong>{roleLabel(message.role)}</strong>
                    {message.name ? <span>{message.name}</span> : null}
                  </div>
                  <p>{messageText(message)}</p>
                </article>
              ))
            )}
            {loadState === "sending" ? (
              <article className="message message--assistant message--pending">
                <div className="message-meta">
                  <strong>Agent</strong>
                  <span>working</span>
                </div>
                <p>Waiting for the agent response...</p>
              </article>
            ) : null}
          </div>

          <form className="composer" onSubmit={(event) => void handleSend(event)}>
            <label htmlFor="message-input">Message</label>
            <textarea
              id="message-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={activeSessionId ? "Send a message to the local agent..." : "Create a session first..."}
              disabled={!activeSessionId || isBusy}
              rows={3}
            />
            <div className="composer-actions">
              <span>{activeSessionId ? "BFF route: POST /api/sessions/:id/messages" : "No active session"}</span>
              <button className="button button--primary" type="submit" disabled={!canSend}>
                {loadState === "sending" ? "Sending" : "Send"}
              </button>
            </div>
          </form>
        </section>

        <aside className="detail-pane" aria-label="Session details">
          <section>
            <h2>Runtime</h2>
            <dl className="detail-list">
              <div>
                <dt>BFF</dt>
                <dd>{health?.bffStatus ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Agent</dt>
                <dd>{health?.agentStatus ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Transport</dt>
                <dd>HTTP via BFF</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>Current Session</h2>
            {activeSession ? (
              <dl className="detail-list">
                <div>
                  <dt>ID</dt>
                  <dd className="mono">{activeSession.id}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatTime(activeSession.updatedAt)}</dd>
                </div>
                <div>
                  <dt>Rounds</dt>
                  <dd>{activeSession.rounds ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{activeSession.busy ? "busy" : "idle"}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">No session selected.</p>
            )}
          </section>

          <section>
            <h2>Scope</h2>
            <ul className="scope-list">
              <li>Local developer console</li>
              <li>Chat-first workflow</li>
              <li>Web calls BFF only</li>
              <li>Tool approval UI later</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
