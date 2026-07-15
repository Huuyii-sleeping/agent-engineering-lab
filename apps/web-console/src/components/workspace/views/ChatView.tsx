import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { Paperclip, RefreshCw, SendHorizontal, SlidersHorizontal } from "lucide-react";
import type { AgentProfile, ChatMessage, HealthStatus, SessionDetail } from "../../../api";
import { streamLabel } from "../../../features/chat/lib/chat-format";

function messageAvatar(message: ChatMessage): { cls: string; text: string; name: string } {
  if (message.role === "user") {
    return { cls: "msg-av u", text: "你", name: "你" };
  }
  const isSub = message.name && message.name !== "streaming" && message.name !== "Orbit";
  if (isSub) {
    return { cls: "msg-av sub", text: (message.name ?? "S").slice(0, 1), name: message.name ?? "子代理" };
  }
  return { cls: "msg-av a", text: "O", name: "Orbit" };
}

export function ChatView({
  active,
  activeAgent,
  activeSession,
  activeSessionId,
  messages,
  draft,
  canSend,
  isBusy,
  error,
  streamState,
  health,
  textareaRef,
  onDraftChange,
  onSend,
  onComposerKeyDown,
  onCreateSession,
  onBootstrap,
}: {
  active: boolean;
  activeAgent: AgentProfile | null;
  activeSession: SessionDetail | null;
  activeSessionId: string | null;
  messages: ChatMessage[];
  draft: string;
  canSend: boolean;
  isBusy: boolean;
  error: string | null;
  streamState: "connecting" | "connected" | "disconnected";
  health: HealthStatus | null;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onDraftChange: (value: string) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCreateSession: () => void;
  onBootstrap: () => void;
}) {
  const boundSkills = activeAgent?.skills.map((skill) => skill.skillId) ?? [];
  const streamTone = streamState === "connected" ? "ok" : "warn";

  return (
    <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="chat">
      {error ? (
        <div className="side-card" style={{ borderColor: "var(--danger-bg)", background: "var(--danger-bg)", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "var(--danger)" }}>请求失败：{error}</div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={onBootstrap}>
            <RefreshCw aria-hidden="true" /> 重试
          </button>
        </div>
      ) : null}

      <div className="chat">
        <div className="thread">
          {!activeSessionId ? (
            <div className="side-card" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>还没有会话</div>
              <div style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                新建一个会话，开始与 {activeAgent ? activeAgent.name : "Orbit"} 对话。
              </div>
              <button type="button" className="btn btn-primary" onClick={onCreateSession}>
                <Plus2 /> 新建会话
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="side-card" style={{ textAlign: "center", padding: 40, color: "var(--text-soft)" }}>
              发送第一条消息开始对话。
            </div>
          ) : (
            messages.map((message, index) => {
              if (message.role === "tool") {
                return (
                  <div className="tool" key={`tool-${index}`}>
                    <div className="tool-h">
                      <span className="nm">{message.name ?? "工具调用"}</span>
                      <span className="st">
                        <span className="d" /> 完成
                      </span>
                    </div>
                    <div className="tool-b">{message.content}</div>
                  </div>
                );
              }

              const av = messageAvatar(message);
              const isSubEmpty = av.cls === "msg-av sub" && !message.content?.trim();
              if (isSubEmpty) {
                return (
                  <div className="handoff" key={`handoff-${index}`}>
                    <div className={av.cls}>{av.text}</div>
                    <div>
                      <div className="who">已委派 {av.name} 子代理接管</div>
                      <div className="desc">{message.content?.trim() || "已接管任务，正在并行编排执行。"}</div>
                    </div>
                  </div>
                );
              }

              const isStreamingPlaceholder =
                message.role === "assistant" && message.name === "streaming" && !message.content?.trim() && isBusy;
              const showNameTag =
                message.name && message.name !== "streaming" && message.name !== "Orbit" ? (
                  <span className="t">{message.name}</span>
                ) : null;

              return (
                <div className="msg" key={`${message.role}-${index}`}>
                  <div className={av.cls}>{av.text}</div>
                  <div className="msg-body">
                    <div className="msg-name">
                      {av.name}
                      {showNameTag}
                    </div>
                    {isStreamingPlaceholder ? (
                      <div className="typing">
                        <i />
                        <i />
                        <i />
                      </div>
                    ) : (
                      <div className="bubble" style={{ whiteSpace: "pre-wrap" }}>
                        {message.content}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div>
          <div className="side-card">
            <div className="side-h">会话信息</div>
            <div className="kv">
              <span className="k">Agent</span>
              <span className="v">{activeAgent?.name ?? "—"}</span>
            </div>
            <div className="kv">
              <span className="k">模型</span>
              <span className="v">{activeSession?.model ?? "claude-sonnet"}</span>
            </div>
            <div className="kv">
              <span className="k">运行时</span>
              <span className="v">{health?.ok ? "local · online" : "offline"}</span>
            </div>
            <div className="kv">
              <span className="k">消息</span>
              <span className="v">{messages.length}</span>
            </div>
          </div>

          <div className="side-card">
            <div className="side-h">已绑定技能</div>
            <div className="mini-list">
              {boundSkills.length === 0 ? (
                <div className="mini" style={{ color: "var(--text-muted)" }}>
                  未绑定技能
                </div>
              ) : (
                boundSkills.map((skillId) => (
                  <div className="mini" key={skillId}>
                    <span className="d" />
                    {skillId} · stable
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="side-card">
            <div className="side-h">运行时预检</div>
            <div className="mini-list">
              <div className="mini">
                <span className="d" />
                {boundSkills.length} 项技能可加载
              </div>
              <div className="mini">
                <span className="d" />
                工具调用权限已授予
              </div>
              <div
                className="mini"
                style={streamTone === "ok" ? undefined : { color: "var(--warn)" }}
              >
                <span
                  className="d"
                  style={{ background: streamTone === "ok" ? "var(--accent)" : "var(--warn)" }}
                />
                SSE {streamLabel(streamState)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <form className="composer" onSubmit={onSend}>
        <div className="composer-box">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={activeSessionId ? "给 Orbit 发消息…  Enter 发送 · Shift+Enter 换行" : "先新建一个会话…"}
            disabled={!activeSessionId || isBusy}
            rows={1}
          />
          <div className="composer-row">
            <button type="button" className="tool-btn" title="附件" aria-label="附件">
              <Paperclip aria-hidden="true" />
            </button>
            <button type="button" className="tool-btn" title="工具" aria-label="工具">
              <SlidersHorizontal aria-hidden="true" />
            </button>
            <div className="sp" />
            <button type="submit" className="send" disabled={!canSend} title="发送" aria-label="发送">
              <SendHorizontal aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function Plus2() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
