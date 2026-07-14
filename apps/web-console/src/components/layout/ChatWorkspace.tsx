import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { PanelLeftClose, PanelLeftOpen, Radio, RefreshCw, SendHorizontal } from "lucide-react";
import { quickActions, shortcutHints } from "../../app/navigation";
import type { StreamState } from "../../app/types";
import type { AgentProfile, ChatMessage, SessionDetail } from "../../api";
import { AgentTestBanner } from "../../features/chat/components/AgentTestBanner";
import { MessageAvatar } from "../../features/chat/components/MessageAvatar";
import { MessageBody } from "../../features/chat/components/MessageBody";
import { NewConversationPanel } from "../../features/chat/components/NewConversationPanel";
import { roleLabel, streamLabel } from "../../features/chat/lib/chat-format";

export function ChatWorkspace({
  activeAgent,
  activeSession,
  activeSessionId,
  canSend,
  conversationRuntimeState,
  draft,
  error,
  isBusy,
  isSidebarCollapsed,
  messages,
  streamState,
  textareaRef,
  onBackToAgent,
  onBootstrap,
  onComposerKeyDown,
  onCreateSession,
  onDraftChange,
  onSend,
  onToggleSidebar,
  sessionTitleFor,
}: {
  activeAgent: AgentProfile | null;
  activeSession: SessionDetail | null;
  activeSessionId: string | null;
  canSend: boolean;
  conversationRuntimeState: "loading" | "running" | "completed" | "idle";
  draft: string;
  error: string | null;
  isBusy: boolean;
  isSidebarCollapsed: boolean;
  messages: ChatMessage[];
  streamState: StreamState;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onBackToAgent: () => void;
  onBootstrap: () => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCreateSession: () => void;
  onDraftChange: (value: string) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  onToggleSidebar: () => void;
  sessionTitleFor: (session: SessionDetail) => string;
}) {
  return (
    <section className="workspace-shell">
      <main className={`chat-shell ${activeAgent ? "chat-shell--with-agent" : ""} ${error ? "chat-shell--has-error" : ""}`}>
        <header className="conversation-header">
          <button
            aria-expanded={!isSidebarCollapsed}
            aria-label={isSidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
            className="icon-button header-icon"
            type="button"
            onClick={onToggleSidebar}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen size={20} strokeWidth={2.1} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={20} strokeWidth={2.1} aria-hidden="true" />
            )}
          </button>
          <div className="conversation-title">
            <h1>{activeSession ? sessionTitleFor(activeSession) : "Orbit"}</h1>
            <span className={`conversation-state conversation-state--${conversationRuntimeState}`}>
              {conversationRuntimeState}
            </span>
          </div>
          <div className="header-actions">
            <span className="stream-indicator" title={streamLabel(streamState)}>
              <Radio className={`stream-icon stream-icon--${streamState}`} size={18} strokeWidth={2.2} aria-hidden="true" />
              <span className="sr-only">{streamLabel(streamState)}</span>
            </span>
            <button className="icon-button" type="button" onClick={onBootstrap} aria-label="刷新连接与会话">
              <RefreshCw size={19} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </header>

        {error ? (
          <div className="error-toast" role="alert">
            <strong>请求失败</strong>
            <span>{error}</span>
            <button type="button" onClick={onBootstrap}>
              重试
            </button>
          </div>
        ) : null}

        <AgentTestBanner agent={activeAgent} onBack={onBackToAgent} />

        <section className="transcript" aria-label="聊天内容">
          {!activeSessionId ? (
            <NewConversationPanel onCreate={onCreateSession} />
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

        <form className="composer" onSubmit={onSend}>
          <label className="sr-only" htmlFor="message-input">
            消息
          </label>
          <textarea
            ref={textareaRef}
            id="message-input"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
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
  );
}
