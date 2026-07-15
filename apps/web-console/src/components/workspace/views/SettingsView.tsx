import { useState } from "react";
import { Settings, SlidersHorizontal, UserRound } from "lucide-react";
import { BrandMark } from "../../BrandMark";
import type { HealthStatus, UserProfile } from "../../../api";
import type { SettingsSection } from "../../../settings-route";
import type { ThemeMode } from "../../../theme";
import { streamLabel } from "../../../features/chat/lib/chat-format";

export function SettingsView({
  active,
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
  active: boolean;
  activeSection: SettingsSection;
  health: HealthStatus | null;
  sessionCount: number;
  streamState: "connecting" | "connected" | "disconnected";
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
  const [language, setLanguage] = useState<"中文" | "EN">("中文");
  const [reduceMotion, setReduceMotion] = useState(true);

  const navItems: { section: SettingsSection; label: string; icon: typeof UserRound }[] = [
    { section: "profile", label: "个人资料", icon: UserRound },
    { section: "preferences", label: "偏好", icon: SlidersHorizontal },
    { section: "system", label: "系统", icon: Settings },
  ];

  return (
    <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="settings">
      <div className="set">
        <div className="set-rail">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <BrandMark size={18} />
            </span>
            <span className="brand-text">Orbit</span>
          </div>
          <div className="set-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.section}
                  className={activeSection === item.section ? "on" : ""}
                  onClick={() => onSectionChange(item.section)}
                >
                  <Icon aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="set-panel">
          <span className="eyebrow">
            {activeSection === "profile" ? "个人资料" : activeSection === "preferences" ? "偏好" : "系统"}
          </span>
          <h2 className="h2">
            {activeSection === "profile" ? "你的身份" : activeSection === "preferences" ? "界面与交互" : "运行与连接"}
          </h2>
          <p className="sub">
            {activeSection === "profile"
              ? "用于会话默认署名与本地档案，全部存储于本机。"
              : activeSection === "preferences"
                ? "主题、语言与动效等本地偏好。"
                : "运行时健康、BFF 连接与协议化审批状态。"}
          </p>

          {activeSection === "profile" ? (
            <div className="set-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span className="icon-box" style={{ width: 48, height: 48 }} aria-hidden="true">
                  <UserRound aria-hidden="true" />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 650 }}>{editingProfile ? profileDraft.displayName || "未命名" : profile.displayName}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: "var(--ff-mono)" }}>
                    {editingProfile ? profileDraft.description : profile.description}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleProfileEdit}>
                  {editingProfile ? "完成" : "更换头像"}
                </button>
              </div>

              <div className="field" style={{ marginTop: 18 }}>
                <label>昵称</label>
                <input
                  className="input"
                  value={profileDraft.displayName}
                  disabled={!editingProfile}
                  onChange={(e) => onProfileDraftChange({ ...profileDraft, displayName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>简介</label>
                <textarea
                  className="input"
                  value={profileDraft.description}
                  disabled={!editingProfile}
                  onChange={(e) => onProfileDraftChange({ ...profileDraft, description: e.target.value })}
                />
              </div>
              {editingProfile ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={onSaveProfile}>
                    保存更改
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelProfileEdit}>
                    取消
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeSection === "preferences" ? (
            <div className="set-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-main)" }}>主题</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>深色 / 浅色</div>
                </div>
                <div className="seg">
                  <button className={theme === "dark" ? "on" : ""} onClick={() => theme !== "dark" && onThemeToggle()}>
                    深色
                  </button>
                  <button className={theme === "light" ? "on" : ""} onClick={() => theme !== "light" && onThemeToggle()}>
                    浅色
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-main)" }}>界面语言</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>显示语言</div>
                </div>
                <div className="seg">
                  <button className={language === "中文" ? "on" : ""} onClick={() => setLanguage("中文")}>
                    中文
                  </button>
                  <button className={language === "EN" ? "on" : ""} onClick={() => setLanguage("EN")}>
                    EN
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-main)" }}>减少动效</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>降低过渡与动画</div>
                </div>
                <div
                  className={`toggle ${reduceMotion ? "on" : ""}`}
                  role="button"
                  aria-pressed={reduceMotion}
                  onClick={() => setReduceMotion((v) => !v)}
                >
                  <i />
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "system" ? (
            <div className="set-card">
              <div className="kv">
                <span className="k">运行时健康检查</span>
                <span className="pill green">
                  <span className="d" /> {health?.ok ? "正常" : "异常"}
                </span>
              </div>
              <div className="kv">
                <span className="k">BFF 连接</span>
                <span className="pill green">
                  <span className="d" /> {health?.bffStatus ?? "unknown"}
                </span>
              </div>
              <div className="kv">
                <span className="k">SSE 连接</span>
                <span className="pill green">
                  <span className="d" /> {streamLabel(streamState)}
                </span>
              </div>
              <div className="kv">
                <span className="k">历史会话</span>
                <span className="v">{sessionCount}</span>
              </div>
              <div className="kv">
                <span className="k">存储位置</span>
                <span className="v">~/.orbit</span>
              </div>
              <div className="kv" style={{ borderBottom: 0 }}>
                <span className="k">协议化审批</span>
                <span className="pill green">
                  <span className="d" /> 启用
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
