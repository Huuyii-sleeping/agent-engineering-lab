import { useState } from "react";
import { Download, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import type { AgentProfile, SkillAuditEvent, SkillPackageInput, SkillRegistryItem } from "../../../api";

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
  onRollbackSkill,
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
  onSkillAction: (skill: SkillRegistryItem) => void;
  onRollbackSkill: (skill: SkillRegistryItem) => void;
  onUploadPackage: (input: SkillPackageInput) => void;
  onRefreshRegistry: () => void;
}) {
  const [source, setSource] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [maturity, setMaturity] = useState<string>("all");
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [uploadText, setUploadText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const sources = Array.from(new Set(skills.map((skill) => skill.registrySource)));
  const maturities = Array.from(new Set(skills.map((skill) => skill.maturity)));

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

  return (
    <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="skills">
      <div className="section-head">
        <span className="eyebrow">技能市场 · Skill Hub</span>
        <h2 className="h2">发现、安装与管理社区技能</h2>
        <p className="sub">基于全文检索安装技能，支持按来源筛选、私有发布与一键升级 / 回滚 / 卸载。</p>
      </div>

      <div className="hub">
        <div>
          <div className="filter">
            <div className="filter-h">来源</div>
            <div className={`fitem ${source === "all" ? "on" : ""}`} onClick={() => setSource("all")}>
              全部 <span className="c">{skills.length}</span>
            </div>
            {sources.map((src) => (
              <div key={src} className={`fitem ${source === src ? "on" : ""}`} onClick={() => setSource(src)}>
                {sourceLabel(src)} <span className="c">{skills.filter((s) => s.registrySource === src).length}</span>
              </div>
            ))}
          </div>

          <div className="filter">
            <div className="filter-h">状态</div>
            {statusOptions.map((opt) => (
              <div key={opt.key} className={`fitem ${status === opt.key ? "on" : ""}`} onClick={() => setStatus(opt.key)}>
                {opt.label}{" "}
                <span className="c">
                  {opt.key === "all"
                    ? skills.length
                    : opt.key === "installed"
                      ? skills.filter((s) => s.installed).length
                      : opt.key === "updateAvailable"
                        ? skills.filter((s) => s.status === "updateAvailable").length
                        : skills.filter((s) => !s.installed).length}
                </span>
              </div>
            ))}
          </div>

          <div className="filter">
            <div className="filter-h">成熟度</div>
            <div className={`fitem ${maturity === "all" ? "on" : ""}`} onClick={() => setMaturity("all")}>
              全部 <span className="c">{skills.length}</span>
            </div>
            {maturities.map((m) => (
              <div key={m} className={`fitem ${maturity === m ? "on" : ""}`} onClick={() => setMaturity(m)}>
                {m} <span className="c">{skills.filter((s) => s.maturity === m).length}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: "100%", marginTop: 14, justifyContent: "center" }}
            onClick={() => onUploadOpenChange(!uploadOpen)}
          >
            <Upload aria-hidden="true" /> 私有发布
          </button>
          {uploadOpen ? (
            <div className="filter" style={{ marginTop: 12 }}>
              <textarea
                className="input"
                rows={6}
                style={{ fontFamily: "var(--ff-mono)", fontSize: 12 }}
                placeholder='{"files":[{"path":"SKILL.md","content":"..."}]}'
                value={uploadText}
                onChange={(e) => setUploadText(e.target.value)}
              />
              {uploadError ? (
                <small style={{ color: "var(--danger)", display: "block", marginTop: 6 }}>{uploadError}</small>
              ) : null}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                onClick={handleUpload}
              >
                <Upload aria-hidden="true" /> 发布 Skill
              </button>
            </div>
          ) : null}
        </div>

        <div className="skill-grid">
          {filtered.length === 0 ? (
            <div className="skill" style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--text-soft)" }}>
              没有匹配的 Skill
            </div>
          ) : (
            filtered.map((skill) => {
              const action = skillActionLabel(skill);
              const skillAgents = agents.filter((agent) => agent.skills.some((b) => b.skillId === skill.id));
              const skillAudits = auditEvents.filter((e) => e.skillId === skill.id).slice(0, 3);
              const open = openDetailId === skill.id;
              return (
                <article key={skill.id} className={`skill ${open ? "open" : ""}`}>
                  <div className="skill-top">
                    <span className="icon-box" aria-hidden="true">
                      <ShieldCheck aria-hidden="true" />
                    </span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 650 }}>{skill.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--ff-mono)" }}>
                        v{skill.version}
                      </div>
                    </div>
                    <span style={{ marginLeft: "auto" }}>{statusPill(skill)}</span>
                  </div>
                  <div className="skill-meta">
                    <span className="chip">{sourceLabel(skill.registrySource)}</span>
                    <span className="chip">{skill.maturity}</span>
                  </div>
                  <div className="skill-desc">{skill.summary || skill.description}</div>
                  <div className="skill-foot">
                    <span>{compactNumber(skill.downloads)} 下载</span>
                    <span>★ {skill.rating === null ? "—" : skill.rating.toFixed(1)}</span>
                    <span className="sp" />
                    {skill.installed ? (
                      <button type="button" className="btn btn-ghost btn-sm" data-detail onClick={() => setOpenDetailId(open ? null : skill.id)}>
                        {open ? "收起" : "详情"}
                      </button>
                    ) : null}
                    {skill.status === "updateAvailable" ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onSkillAction(skill)}>
                        <Download aria-hidden="true" /> 升级
                      </button>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSkillAction(skill)}>
                        {action.label}
                      </button>
                    )}
                  </div>

                  {skill.installed && skill.previousInstalledVersion ? (
                    <div style={{ marginTop: 8 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRollbackSkill(skill)}>
                        <RotateCcw aria-hidden="true" /> 回滚
                      </button>
                    </div>
                  ) : null}

                  {open ? (
                    <div className="detail">
                      <div className="detail-h">权限</div>
                      <div className="mini-list" style={{ marginBottom: 12 }}>
                        {skill.permissions.length === 0 ? (
                          <div className="mini" style={{ color: "var(--text-muted)" }}>无声明权限</div>
                        ) : (
                          skill.permissions.map((perm) => (
                            <div className="mini" key={perm}>
                              <span className="d" /> {perm}
                            </div>
                          ))
                        )}
                      </div>
                      <div className="detail-h">校验</div>
                      <div className="mini-list" style={{ marginBottom: 12 }}>
                        <div className="mini">
                          <span className="d" /> hash {skill.packageSha256 ? `sha256:${skill.packageSha256.slice(0, 8)}…` : "未提供"}
                        </div>
                        <div className="mini">
                          <span className="d" /> {skill.validationErrors.length === 0 ? "校验通过" : `${skill.validationErrors.length} 个校验错误`}
                        </div>
                      </div>
                      <div className="detail-h">使用中的 Agent</div>
                      <div className="mini-list" style={{ marginBottom: 12 }}>
                        {skillAgents.length === 0 ? (
                          <div className="mini" style={{ color: "var(--text-muted)" }}>当前没有 Agent 绑定</div>
                        ) : (
                          skillAgents.map((agent) => (
                            <div className="mini" key={agent.id}>
                              <span className="d" /> {agent.name}
                            </div>
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
