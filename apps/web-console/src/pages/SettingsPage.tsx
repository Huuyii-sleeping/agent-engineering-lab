import {
  ArrowLeft,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  Database,
  Download,
  Globe2,
  HelpCircle,
  Info,
  Keyboard,
  Lock,
  LogOut,
  MessageSquare,
  Monitor,
  Palette,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import { sidebarSettings } from "../app/navigation";
import type { StreamState } from "../app/types";
import type { HealthStatus, UserProfile } from "../api";
import type { SettingsSection } from "../settings-route";
import type { ThemeMode } from "../theme";
import { streamLabel } from "../features/chat/lib/chat-format";

export function SettingsPage({
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
          <span>Orbit 本地控制台</span>
        </div>
      </header>

      <section className="settings-body" aria-label="个人设置内容">
        <aside className="settings-rail">
          <div className="settings-rail-brand">
            <span aria-hidden="true">
              <BrandMark size={20} />
            </span>
            <div>
              <strong>Orbit</strong>
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
                    <span className="settings-row-icon">
                      <BrandMark size={18} />
                    </span>
                    <span className="settings-row-copy">
                      <strong>Orbit</strong>
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
                      <strong>关于 Orbit</strong>
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
