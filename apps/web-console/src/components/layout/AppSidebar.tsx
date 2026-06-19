import { BrainCircuit, Check, MoreVertical, Pencil, Pin, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { navItems, sidebarSettings } from "../../app/navigation";
import type { SessionSummary } from "../../api";
import type { SessionMetadataMap } from "../../session-metadata";
import type { SettingsSection } from "../../settings-route";
import { formatTime } from "../../features/chat/lib/chat-format";

export function AppSidebar({
  activeSessionId,
  areAllVisibleSessionsSelected,
  isCollapsed,
  isSessionBatchMode,
  openSessionMenuId,
  selectedSessionCount,
  selectedSessionIds,
  sessionMetadata,
  visibleSessions,
  onBatchHideSessions,
  onClearSelectedSessions,
  onCreateSession,
  onHideSession,
  onOpenSettings,
  onRenameSession,
  onSelectAllVisibleSessions,
  onSelectSession,
  onToggleBatchMode,
  onTogglePinned,
  onToggleSessionMenu,
  onToggleSessionSelection,
  sessionTitleFor,
}: {
  activeSessionId: string | null;
  areAllVisibleSessionsSelected: boolean;
  isCollapsed: boolean;
  isSessionBatchMode: boolean;
  openSessionMenuId: string | null;
  selectedSessionCount: number;
  selectedSessionIds: Set<string>;
  sessionMetadata: SessionMetadataMap;
  visibleSessions: SessionSummary[];
  onBatchHideSessions: () => void;
  onClearSelectedSessions: () => void;
  onCreateSession: () => void;
  onHideSession: (session: SessionSummary) => void;
  onOpenSettings: (section: SettingsSection) => void;
  onRenameSession: (session: SessionSummary) => void;
  onSelectAllVisibleSessions: () => void;
  onSelectSession: (sessionId: string) => void;
  onToggleBatchMode: () => void;
  onTogglePinned: (session: SessionSummary) => void;
  onToggleSessionMenu: (sessionId: string) => void;
  onToggleSessionSelection: (sessionId: string) => void;
  sessionTitleFor: (session: SessionSummary) => string;
}) {
  return (
    <aside className="sidebar" aria-hidden={isCollapsed} aria-label="本地控制台导航">
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
              onClick={onToggleBatchMode}
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
            <button className="icon-button" type="button" onClick={onCreateSession} aria-label="新建会话">
              <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </span>
        </div>

        {isSessionBatchMode ? (
          <div className="history-batch-bar" aria-label="批量操作">
            <span>{selectedSessionCount} 已选</span>
            <button type="button" onClick={areAllVisibleSessionsSelected ? onClearSelectedSessions : onSelectAllVisibleSessions}>
              {areAllVisibleSessionsSelected ? "取消全选" : "全选"}
            </button>
            <button
              className="history-batch-danger"
              type="button"
              onClick={onBatchHideSessions}
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
                      onToggleSessionSelection(session.id);
                      return;
                    }
                    onSelectSession(session.id);
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
                      onClick={() => onToggleSessionMenu(session.id)}
                    >
                      <MoreVertical size={17} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                    {openSessionMenuId === session.id ? (
                      <span className="session-menu" role="menu">
                        <button className="session-menu-item" role="menuitem" type="button" onClick={() => onTogglePinned(session)}>
                          <Pin
                            className={sessionMetadata[session.id]?.pinned ? "session-menu-item-icon--active" : ""}
                            size={15}
                            strokeWidth={2.2}
                            aria-hidden="true"
                          />
                          <span>{sessionMetadata[session.id]?.pinned ? "取消置顶" : "置顶"}</span>
                        </button>
                        <button className="session-menu-item" role="menuitem" type="button" onClick={() => onRenameSession(session)}>
                          <Pencil size={15} strokeWidth={2.2} aria-hidden="true" />
                          <span>重命名</span>
                        </button>
                        <button
                          className="session-menu-item session-menu-item--danger"
                          role="menuitem"
                          type="button"
                          onClick={() => onHideSession(session)}
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
              onClick={() => onOpenSettings(item.section)}
            >
              <Icon size={18} strokeWidth={2.1} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
