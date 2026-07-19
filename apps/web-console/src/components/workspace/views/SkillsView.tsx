import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BrainCircuit,
  Code2,
  Download,
  FileText,
  Image,
  Server,
  ShieldCheck,
  Terminal,
  Upload,
} from "lucide-react";
import type { AgentProfile, SkillAuditEvent, SkillPackageInput, SkillRegistryItem } from "../../../api";

/* ── Card personalization ─────────────────────────────────── */

/** Accent palette for skill cards — stable per registrySource + id hash. */
const SKILL_PALETTE = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f43f5e", // rose
];

function skillAccent(skill: SkillRegistryItem): string {
  const key = `${skill.registrySource}:${skill.id}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return SKILL_PALETTE[Math.abs(hash) % SKILL_PALETTE.length];
}

/** Pick an icon based on skill category keywords. */
function skillIcon(category: string): typeof Code2 {
  const c = category.toLowerCase();
  if (/代码|开发|编程|code|dev/i.test(c)) return Code2;
  if (/检索|搜索|search|web/i.test(c)) return Terminal;
  if (/文档|pdf|file|doc|read/i.test(c)) return FileText;
  if (/数据|data|sql|analy/i.test(c)) return BarChart3;
  if (/图像|图片|image|创意|gen|ai/i.test(c)) return Image;
  if (/记忆|memory|context|运行时|runtime/i.test(c)) return BrainCircuit;
  if (/运维|部署|deploy|ops|server/i.test(c)) return Server;
  return ShieldCheck;
}

/* ── Helpers ──────────────────────────────────────────────── */

function compactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function eventTimeLabel(value: number): string {
  if (!value) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function sourceLabel(source: SkillRegistryItem["registrySource"]): string {
  const labels: Record<SkillRegistryItem["registrySource"], string> = {
    official: "Official",
    verified: "Verified",
    community: "Community",
    private: "Private",
    local: "Local",
  };
  return labels[source];
}

function skillActionLabel(skill: SkillRegistryItem): { label: string; primary: boolean } {
  if (skill.status === "updateAvailable") return { label: "升级", primary: true };
  if (skill.installed) return { label: "卸载", primary: false };
  return { label: "安装", primary: false };
}

/** The version this skill itself resolves to (installed version, or its own declared version). */
function displayVersion(skill: SkillRegistryItem): string {
  const v = skill.installed
    ? skill.installedVersion || skill.version
    : skill.version || skill.versions[0];
  return v || "0.0.0";
}

/* ── View ─────────────────────────────────────────────────── */

export function SkillsView({
  active,
  skills,
  agents,
  auditEvents,
  query,
  registryRefreshing,
  uploadOpen,
  onUploadOpenChange,
  onSkillAction,
  onUploadPackage,
  onRefreshRegistry,
}: {
  active: boolean;
  skills: SkillRegistryItem[];
  agents: AgentProfile[];
  auditEvents: SkillAuditEvent[];
  query: string;
  registryRefreshing: boolean;
  uploadOpen: boolean;
  onUploadOpenChange: (open: boolean) => void;
  onSkillAction: (skill: SkillRegistryItem, version: string) => void;
  onUploadPackage: (input: SkillPackageInput) => void;
  onRefreshRegistry: () => void;
}) {
  const [source, setSource] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [maturity, setMaturity] = useState<string>("all");
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [uploadText, setUploadText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Per-skill chosen install version (keyed by skill id); falls back to displayVersion.
  const [installVersions, setInstallVersions] = useState<Record<string, string>>({});

  function installVersionFor(skill: SkillRegistryItem): string {
    return installVersions[skill.id] ?? displayVersion(skill);
  }

  // Popover anchor: only the open card carries the ref so outside-click closes it.
  const cardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openDetailId) return;
    function onDown(e: MouseEvent): void {
      const target = e.target as Node;
      if (cardRef.current && !cardRef.current.contains(target)) {
        setOpenDetailId(null);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpenDetailId(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openDetailId]);

  const sources = Array.from(new Set(skills.map((s) => s.registrySource)));
  const maturities = Array.from(new Set(skills.map((s) => s.maturity)));

  const statusOptions: { key: string; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "installed", label: "已安装" },
    { key: "updateAvailable", label: "可更新" },
    { key: "available", label: "可下载" },
  ];

  const keyword = query.trim().toLowerCase();
  const filtered = skills.filter((skill) => {
    const haystack = `${skill.name} ${skill.summary} ${skill.category} ${skill.tags.join(" ")}`.toLowerCase();
    if (keyword && !haystack.includes(keyword)) return false;
    if (source !== "all" && skill.registrySource !== source) return false;
    if (maturity !== "all" && skill.maturity !== maturity) return false;
    if (status === "installed" && !skill.installed) return false;
    if (status === "updateAvailable" && skill.status !== "updateAvailable") return false;
    if (status === "available" && skill.installed) return false;
    return true;
  });

  function handleUpload(): void {
    try {
      const parsed = JSON.parse(uploadText) as unknown;
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { files?: unknown }).files)) {
        setUploadError("Skill package 必须是包含 files 的 JSON 对象。");
        return;
      }
      setUploadError(null);
      onUploadPackage(parsed as SkillPackageInput);
      setUploadText("");
      onUploadOpenChange(false);
    } catch {
      setUploadError("请输入合法的 Skill package JSON。");
    }
  }

  function statusPill(skill: SkillRegistryItem) {
    if (skill.status === "updateAvailable") return <span className="pill amber"><span className="d" />可更新</span>;
    if (skill.installed) return <span className="pill green"><span className="d" />已安装</span>;
    return <span className="pill"><span className="d" />未安装</span>;
  }

  /** Render a single filter group as a row of pills inside the toolbar. */
  function filterGroup(label: string, items: { key: string; label: string; count: number }[], activeKey: string, onSelect: (k: string) => void) {
    return (
      <div className="hub-filter-group">
        <span className="hub-filter-label">{label}</span>
        <div className="hub-filter-pills">
          {items.map((item) => (
            <button
              type="button"
              className={`hub-pill ${activeKey === item.key ? "on" : ""}`}
              onClick={() => onSelect(item.key)}
            >
              {item.label}
              <span className="c">{item.count}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const sourceItems = [
    { key: "all", label: "全部", count: skills.length },
    ...sources.map((src) => ({ key: src, label: sourceLabel(src), count: skills.filter((s) => s.registrySource === src).length })),
  ];

  const statusItems = statusOptions.map((opt) => ({
    key: opt.key,
    label: opt.label,
    count:
      opt.key === "all"
        ? skills.length
        : opt.key === "installed"
          ? skills.filter((s) => s.installed).length
          : opt.key === "updateAvailable"
            ? skills.filter((s) => s.status === "updateAvailable").length
            : skills.filter((s) => !s.installed).length,
  }));

  const maturityItems = [
    { key: "all", label: "全部", count: skills.length },
    ...maturities.map((m) => ({ key: m, label: m, count: skills.filter((s) => s.maturity === m).length })),
  ];

  return (
    <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="skills">
      <div className="section-head">
        <span className="eyebrow">技能市场 · Skill Hub</span>
        <h2 className="h2">发现、安装与管理社区技能</h2>
        <p className="sub">基于全文检索安装技能，支持按来源筛选、私有发布与一键安装 / 升级 / 卸载。</p>
      </div>

      {/* ── Horizontal filter toolbar ─────────────────────── */}
      <div className="hub">
        <div className="hub-toolbar">
          {registryRefreshing ? (
            <span className="pill"><span className="d" /> 正在同步…</span>
          ) : null}

          {filterGroup("来源", sourceItems, source, setSource)}
          {filterGroup("状态", statusItems, status, setStatus)}
          {filterGroup("成熟度", maturityItems, maturity, setMaturity)}

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="btn btn-ghost btn-sm hub-upload-btn"
            onClick={() => onUploadOpenChange(!uploadOpen)}
          >
            <Upload aria-hidden="true" /> 私有发布
          </button>
        </div>

        {uploadOpen ? (
          <div className="hub-upload-panel">
            <textarea
              className="input"
              rows={4}
              style={{ fontFamily: "var(--ff-mono)", fontSize: 12 }}
              placeholder='{"files":[{"path":"SKILL.md","content":"..."}]}'
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
            />
            {uploadError ? (
              <small style={{ color: "var(--danger)", display: "block", marginTop: 6 }}>{uploadError}</small>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleUpload}>
                <Upload aria-hidden="true" /> 发布 Skill
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUploadOpenChange(false)}>
                取消
              </button>
            </div>
          </div>
        ) : null}

        {/* ── Skill card grid ─────────────────────────────── */}
        <div className="skill-grid">
          {filtered.length === 0 ? (
            <div className="skill-empty">
              没有匹配的 Skill
            </div>
          ) : (
            filtered.map((skill) => {
              const action = skillActionLabel(skill);
              const accent = skillAccent(skill);
              const IconComp = skillIcon(skill.category);
              const skillAgents = agents.filter((agent) => agent.skills.some((b) => b.skillId === skill.id));
              const skillAudits = auditEvents.filter((e) => e.skillId === skill.id).slice(0, 3);
              const open = openDetailId === skill.id;
              const ver = displayVersion(skill);

              return (
                <article
                  key={skill.id}
                  ref={open ? cardRef : undefined}
                  className={`skill ${open ? "open" : ""}`}
                >
                  {/* colored accent bar */}
                  <div className="skill-accent" style={{ background: accent }} aria-hidden="true" />

                  <div className="skill-top">
                    <span className="icon-box skill-icon" style={{ color: accent, borderColor: accent + "33", background: accent + "12" }} aria-hidden="true">
                      <IconComp width={18} height={18} />
                    </span>
                    <div>
                      <div className="skill-name">{skill.name}</div>
                      <div className="skill-ver">v{ver}</div>
                    </div>
                    <span style={{ marginLeft: "auto" }}>{statusPill(skill)}</span>
                  </div>

                  <div className="skill-meta">
                    <span className="chip" style={{ color: accent, borderColor: accent + "44", background: accent + "14" }}>{sourceLabel(skill.registrySource)}</span>
                    <span className="chip">{skill.maturity}</span>
                    {skill.deprecated ? <span className="chip chip--warn">弃用</span> : null}
                  </div>

                  <div className="skill-desc">{skill.summary || skill.description}</div>

                  <div className="skill-foot">
                    <span>{compactNumber(skill.downloads)} 下载</span>
                    <span>★ {skill.rating === null ? "—" : skill.rating.toFixed(1)}</span>
                    <span className="sp" />
                    {!skill.installed ? (
                      skill.versions.length > 0 ? (
                        <select
                          className="skill-ver-select"
                          value={installVersionFor(skill)}
                          onChange={(e) =>
                            setInstallVersions((prev) => ({ ...prev, [skill.id]: e.target.value }))
                          }
                          aria-label={`${skill.name} 安装版本`}
                        >
                          {skill.versions.map((v) => (
                            <option key={v} value={v}>v{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="skill-target">v{displayVersion(skill)}</span>
                      )
                    ) : null}
                    <button type="button" className="btn btn-ghost btn-sm" data-detail onClick={() => setOpenDetailId(open ? null : skill.id)}>
                      {open ? "收起" : "详情"}
                    </button>
                    {skill.status === "updateAvailable" ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onSkillAction(skill, installVersionFor(skill))}>
                        <Download aria-hidden="true" /> 升级到 {installVersionFor(skill)}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSkillAction(skill, installVersionFor(skill))}>
                        {action.label}
                      </button>
                    )}
                  </div>

                  {/* Detail popover — absolutely positioned, never reflows the grid */}
                  {open ? (
                    <div className="skill-pop">
                      <div className="detail-h">权限</div>
                      <div className="mini-list" style={{ marginBottom: 12 }}>
                        {skill.permissions.length === 0 ? (
                          <div className="mini" style={{ color: "var(--text-muted)" }}>无声明权限</div>
                        ) : (
                          skill.permissions.map((perm) => (
                            <div className="mini" key={perm}><span className="d" />{perm}</div>
                          ))
                        )}
                      </div>
                      <div className="detail-h">校验</div>
                      <div className="mini-list" style={{ marginBottom: 12 }}>
                        <div className="mini"><span className="d" /> hash {skill.packageSha256 ? `sha256:${skill.packageSha256.slice(0, 8)}…` : "未提供"}</div>
                        <div className="mini"><span className="d" />{skill.validationErrors.length === 0 ? "校验通过" : `${skill.validationErrors.length} 个校验错误`}</div>
                      </div>
                      <div className="detail-h">使用中的 Agent</div>
                      <div className="mini-list" style={{ marginBottom: 12 }}>
                        {skillAgents.length === 0 ? (
                          <div className="mini" style={{ color: "var(--text-muted)" }}>当前没有 Agent 绑定</div>
                        ) : (
                          skillAgents.map((agent) => (
                            <div className="mini" key={agent.id}><span className="d" />{agent.name}</div>
                          ))
                        )}
                      </div>
                      <div className="detail-h">审计日志</div>
                      <div className="audit">
                        {skillAudits.length === 0 ? (
                          <div className="a" style={{ color: "var(--text-muted)" }}>当前没有审计事件</div>
                        ) : (
                          skillAudits.map((ev) => (
                            <div className="a" key={ev.id}>
                              <span className="ts">{eventTimeLabel(ev.at)}</span>
                              {ev.action} · {ev.version || "—"}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
