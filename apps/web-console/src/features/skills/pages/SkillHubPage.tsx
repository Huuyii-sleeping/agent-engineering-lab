import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CircleHelp,
  Download,
  Hash,
  Info,
  Layers3,
  PackageCheck,
  RotateCcw,
  Search,
  ShieldCheck,
  Star,
  Upload,
} from "lucide-react";
import { useState } from "react";
import type {
  AgentProfile,
  RemoteRegistrySettings,
  SkillAuditAction,
  SkillAuditEvent,
  SkillHubReadiness,
  SkillPackageInput,
  SkillRegistryItem,
} from "../../../api";

const allCategories = "全部";
const allStatuses = "全部状态";
const allSources = "全部来源";
const allMaturities = "全部成熟度";
const skillPackageExample = `{
  "files": [
    {
      "path": "SKILL.md",
      "content": "---\\nname: my-skill\\ndescription: Use when this skill should run.\\n---\\n\\n# My Skill\\n"
    },
    {
      "path": "skill.json",
      "content": "{\\"id\\":\\"my-skill\\",\\"name\\":\\"My Skill\\",\\"version\\":\\"0.1.0\\"}"
    }
  ]
}`;

/** Skill operation classes that may require Agent impact confirmation. */
export type SkillImpactActionKind = "primary" | "rollback";

type PendingSkillImpactAction = {
  skillId: string;
  kind: SkillImpactActionKind;
};

type SkillSearchTokens = {
  terms: string[];
  category?: string;
  source?: string;
  status?: string;
  maturity?: string;
  tag?: string;
};

export type SkillLifecycleOperationState = {
  skillId: string;
  kind: SkillImpactActionKind;
};

export type SkillHubFilterState = {
  query: string;
  category: string;
  status: string;
  source: string;
  maturity: string;
  loadedOnly: boolean;
};

function versionLabel(version: string): string {
  return version ? `v${version}` : "无";
}

function installedVersionLabel(skill: SkillRegistryItem): string {
  if (!skill.installed) {
    return "未安装";
  }
  return versionLabel(skill.installedVersion || skill.version);
}

function installedAtLabel(value: number | null): string {
  if (!value) {
    return "未安装";
  }
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function eventTimeLabel(value: number): string {
  if (!value) {
    return "未知时间";
  }
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function auditActionLabel(action: SkillAuditAction): string {
  const labels: Record<SkillAuditAction, string> = {
    download: "下载",
    upload: "上传",
    install: "安装",
    update: "升级",
    rollback: "回滚",
    uninstall: "卸载",
  };
  return labels[action];
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

function agentBindingVersion(agent: AgentProfile, skillId: string): string {
  const binding = agent.skills.find((skill) => skill.skillId === skillId);
  return binding?.version || "";
}

function agentUsesSkill(agent: AgentProfile, skillId: string): boolean {
  return agent.skills.some((skill) => skill.skillId === skillId) || agent.skillIds.includes(skillId);
}

function normalizeSearchToken(value: string): string {
  return value.trim().toLowerCase();
}

/** Parses the SkillHub search box into keyword terms plus ES-style field tokens. */
export function parseSkillSearchQuery(query: string): SkillSearchTokens {
  const tokens: SkillSearchTokens = { terms: [] };
  const parts = query.match(/"[^"]+"|\S+/g) ?? [];
  for (const rawPart of parts) {
    const part = rawPart.replace(/^"|"$/g, "");
    const separator = part.indexOf(":");
    if (separator <= 0) {
      tokens.terms.push(normalizeSearchToken(part));
      continue;
    }
    const key = normalizeSearchToken(part.slice(0, separator));
    const value = normalizeSearchToken(part.slice(separator + 1));
    if (!value) {
      continue;
    }
    if (key === "category" || key === "cat") {
      tokens.category = value;
      continue;
    }
    if (key === "source" || key === "src") {
      tokens.source = value;
      continue;
    }
    if (key === "status") {
      tokens.status = value;
      continue;
    }
    if (key === "maturity") {
      tokens.maturity = value;
      continue;
    }
    if (key === "tag") {
      tokens.tag = value;
      continue;
    }
    tokens.terms.push(normalizeSearchToken(part));
  }
  return tokens;
}

/** Returns the user-facing action label for a Skill lifecycle operation. */
export function skillActionLabel(skill: SkillRegistryItem): string {
  if (skill.deprecated && skill.status === "available") {
    return "已下架";
  }
  if (skill.status === "invalid") {
    return "不可用";
  }
  if (skill.status === "available") {
    return "下载";
  }
  if (skill.status === "updateAvailable") {
    return "升级";
  }
  if (skill.installed) {
    return "卸载";
  }
  return "安装";
}

/** Returns whether the primary Skill lifecycle action should be blocked in the UI. */
export function isPrimarySkillActionDisabled(skill: SkillRegistryItem): boolean {
  return skill.status === "invalid" || (skill.deprecated && skill.status === "available");
}

/** Validates the minimal package structure required before uploading a custom Skill. */
export function validateSkillPackageInput(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Skill package 必须是包含 files 的 JSON 对象。";
  }
  const files = (input as { files?: unknown }).files;
  if (!Array.isArray(files) || files.length === 0) {
    return "Skill package 必须包含非空 files 数组。";
  }
  const normalizedPaths = new Set<string>();
  for (const file of files) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      return "files 中每一项都必须是文件对象。";
    }
    const { path, content } = file as { path?: unknown; content?: unknown };
    if (typeof path !== "string" || !path.trim()) {
      return "每个文件都必须包含非空 path。";
    }
    if (typeof content !== "string" || !content.trim()) {
      return `${path} 必须包含非空 content。`;
    }
    normalizedPaths.add(path.trim().replace(/^\.\/+/, ""));
  }
  if (!normalizedPaths.has("SKILL.md")) {
    return "Skill package 必须包含 SKILL.md。";
  }
  if (!normalizedPaths.has("skill.json")) {
    return "Skill package 必须包含 skill.json。";
  }
  return null;
}

/** Applies the visible SkillHub search and filter state to registry items. */
export function filterSkillRegistry(skills: SkillRegistryItem[], filters: SkillHubFilterState): SkillRegistryItem[] {
  const parsedQuery = parseSkillSearchQuery(filters.query);
  return skills.filter((skill) => {
    const haystack = `${skill.name} ${skill.summary} ${skill.description} ${skill.provider} ${skill.publisher.name} ${skill.registrySource} ${skill.runtime} ${skill.status} ${skill.category} ${skill.maturity} ${skill.tags.join(" ")}`
      .toLowerCase();
    const matchesKeyword =
      parsedQuery.terms.length === 0 || parsedQuery.terms.every((term) => haystack.includes(term));
    const matchesCategory = filters.category === allCategories || skill.category === filters.category;
    const matchesStatus = filters.status === allStatuses || skill.status === filters.status;
    const matchesSource = filters.source === allSources || skill.registrySource === filters.source;
    const matchesMaturity = filters.maturity === allMaturities || skill.maturity === filters.maturity;
    const matchesQueryCategory =
      !parsedQuery.category || normalizeSearchToken(skill.category).includes(parsedQuery.category);
    const matchesQuerySource =
      !parsedQuery.source || normalizeSearchToken(skill.registrySource).includes(parsedQuery.source);
    const matchesQueryStatus =
      !parsedQuery.status || normalizeSearchToken(skill.status).includes(parsedQuery.status);
    const matchesQueryMaturity =
      !parsedQuery.maturity || normalizeSearchToken(skill.maturity).includes(parsedQuery.maturity);
    const matchesQueryTag =
      !parsedQuery.tag || skill.tags.some((tag) => normalizeSearchToken(tag).includes(parsedQuery.tag ?? ""));
    const matchesLoaded = !filters.loadedOnly || skill.installed;
    return (
      matchesKeyword &&
      matchesCategory &&
      matchesStatus &&
      matchesSource &&
      matchesMaturity &&
      matchesQueryCategory &&
      matchesQuerySource &&
      matchesQueryStatus &&
      matchesQueryMaturity &&
      matchesQueryTag &&
      matchesLoaded
    );
  });
}

/** Returns whether a Skill operation should be confirmed because bound Agents may be affected. */
export function shouldConfirmSkillImpact(skill: SkillRegistryItem, affectedAgentCount: number, kind: SkillImpactActionKind): boolean {
  if (affectedAgentCount === 0) {
    return false;
  }
  if (kind === "rollback") {
    return true;
  }
  return skill.status === "updateAvailable" || skill.installed;
}

/** Render the local registry of skills that can be loaded into agents. */
export function SkillHubPage({
  agents,
  auditEvents,
  skillOperationInFlight,
  skills,
  onRollbackSkill,
  onSkillAction,
  onUploadPackage,
}: {
  agents: AgentProfile[];
  auditEvents: SkillAuditEvent[];
  readiness: SkillHubReadiness | null;
  registrySettings: RemoteRegistrySettings | null;
  registryRefreshing: boolean;
  skillOperationInFlight: SkillLifecycleOperationState | null;
  skills: SkillRegistryItem[];
  onRefreshRegistry: () => void;
  onRollbackSkill: (skill: SkillRegistryItem) => void;
  onSkillAction: (skill: SkillRegistryItem) => void;
  onUploadPackage: (input: SkillPackageInput) => void;
}) {
  const [query, setQuery] = useState("");
  const [showLoadedOnly, setShowLoadedOnly] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [customPackageText, setCustomPackageText] = useState("");
  const [customPackageError, setCustomPackageError] = useState<string | null>(null);
  const [pendingImpactAction, setPendingImpactAction] = useState<PendingSkillImpactAction | null>(null);
  const [openDetailSkillId, setOpenDetailSkillId] = useState<string | null>(null);
  const hasSkillOperationInFlight = skillOperationInFlight !== null;
  const filteredSkills = filterSkillRegistry(skills, {
    query,
    category: allCategories,
    status: allStatuses,
    source: allSources,
    maturity: allMaturities,
    loadedOnly: showLoadedOnly,
  });
  const pendingSkill = pendingImpactAction ? skills.find((skill) => skill.id === pendingImpactAction.skillId) ?? null : null;
  const pendingSkillAgents = pendingSkill ? agents.filter((agent) => agentUsesSkill(agent, pendingSkill.id)) : [];

  function compactNumber(value: number): string {
    return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  function handleUpload(): void {
    try {
      const parsed = JSON.parse(customPackageText) as unknown;
      const validationError = validateSkillPackageInput(parsed);
      if (validationError) {
        setCustomPackageError(validationError);
        return;
      }
      setCustomPackageError(null);
      onUploadPackage(parsed as SkillPackageInput);
      setCustomPackageText("");
    } catch {
      setCustomPackageError("请输入合法的 Skill package JSON。");
    }
  }

  function requestSkillAction(skill: SkillRegistryItem): void {
    if (isPrimarySkillActionDisabled(skill)) {
      return;
    }
    if (hasSkillOperationInFlight) {
      return;
    }
    const affectedAgents = agents.filter((agent) => agentUsesSkill(agent, skill.id));
    if (shouldConfirmSkillImpact(skill, affectedAgents.length, "primary")) {
      setPendingImpactAction({ skillId: skill.id, kind: "primary" });
      return;
    }
    onSkillAction(skill);
  }

  function requestRollbackSkill(skill: SkillRegistryItem): void {
    if (hasSkillOperationInFlight) {
      return;
    }
    const affectedAgents = agents.filter((agent) => agentUsesSkill(agent, skill.id));
    if (shouldConfirmSkillImpact(skill, affectedAgents.length, "rollback")) {
      setPendingImpactAction({ skillId: skill.id, kind: "rollback" });
      return;
    }
    onRollbackSkill(skill);
  }

  function confirmPendingImpactAction(): void {
    if (!pendingSkill || !pendingImpactAction) {
      return;
    }
    const action = pendingImpactAction.kind;
    setPendingImpactAction(null);
    if (action === "rollback") {
      onRollbackSkill(pendingSkill);
      return;
    }
    onSkillAction(pendingSkill);
  }

  function isSkillOperationRunning(skill: SkillRegistryItem, kind: SkillImpactActionKind): boolean {
    return skillOperationInFlight?.skillId === skill.id && skillOperationInFlight.kind === kind;
  }

  function primaryOperationLabel(skill: SkillRegistryItem): string {
    return isSkillOperationRunning(skill, "primary") ? "处理中" : skillActionLabel(skill);
  }

  return (
    <main className="skillhub-shell">
      <section className="skillhub-hero">
        <div>
          <span>Production Skill Hub</span>
          <h1>Skill Hub</h1>
          <p>统一管理可被 Agent 安装和绑定的能力包，覆盖官方、验证、社区、私有发布和本地内置来源。</p>
        </div>
      </section>

      <section className="skillhub-workbench" aria-label="Skill 注册表">
        <aside className="skillhub-filter-panel" aria-label="Skill 筛选">
          <div className="skillhub-filter-topline">
            <div className="skillhub-search">
              <Search size={16} strokeWidth={2.2} aria-hidden="true" />
              <input
                value={query}
                placeholder='ES 搜索：网页研究 tag:web source:local status:installed'
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </div>
            <button
              className={`skillhub-loaded-toggle ${showLoadedOnly ? "skillhub-loaded-toggle--active" : ""}`}
              type="button"
              aria-pressed={showLoadedOnly}
              onClick={() => setShowLoadedOnly((current) => !current)}
            >
              <PackageCheck size={16} strokeWidth={2.3} aria-hidden="true" />
              <span>只看已安装</span>
            </button>
          </div>
          <div className="skillhub-search-hints" aria-label="搜索示例">
            <span>支持普通关键词，也支持字段搜索</span>
            <code>category:执行</code>
            <code>source:local</code>
            <code>tag:web</code>
            <code>status:installed</code>
          </div>
          <div className="skillhub-upload-panel" aria-label="发布私有 Skill">
            <div className="skillhub-panel-title skillhub-panel-title--with-tooltip">
              <span>
                <Upload size={15} strokeWidth={2.4} aria-hidden="true" />
                <strong>Private publish</strong>
              </span>
              <button
                className="skillhub-tooltip-trigger"
                type="button"
                aria-describedby="skillhub-upload-format"
                aria-label="查看上传标准格式"
              >
                <CircleHelp size={15} strokeWidth={2.4} aria-hidden="true" />
              </button>
              <pre className="skillhub-format-tooltip" id="skillhub-upload-format" role="tooltip">
                {skillPackageExample}
              </pre>
            </div>
            <button
              className="skillhub-upload-toggle"
              type="button"
              aria-expanded={showUploadForm}
              onClick={() => setShowUploadForm((current) => !current)}
            >
              <Upload size={15} strokeWidth={2.3} aria-hidden="true" />
              <span>{showUploadForm ? "收起发布" : "上传 Skill"}</span>
            </button>
            {showUploadForm ? (
              <div className="skillhub-upload-form">
                <textarea
                  value={customPackageText}
                  rows={6}
                  placeholder='{"files":[{"path":"SKILL.md","content":"---\\nname: my-skill\\ndescription: ..."},{"path":"skill.json","content":"{\"id\":\"my-skill\",\"name\":\"My Skill\",\"version\":\"0.1.0\"}"}]}'
                  onChange={(event) => setCustomPackageText(event.currentTarget.value)}
                />
                {customPackageError ? <small role="alert">{customPackageError}</small> : null}
                <button className="skillhub-upload-submit" type="button" disabled={!customPackageText.trim()} onClick={handleUpload}>
                  <Upload size={15} strokeWidth={2.3} aria-hidden="true" />
                  <span>发布 Skill</span>
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="skillhub-registry" aria-label="可用 Skill">
          <div className="skillhub-registry-bar">
            <span>{filteredSkills.length} 个结果</span>
            <small>{query.trim() ? "搜索结果" : "全部 Skill"}</small>
          </div>

          <div className="skillhub-registry-body">
            <div className="skillhub-grid">
              {filteredSkills.map((skill) => {
                const installed = skill.installed;
                const skillAgents = agents.filter((agent) => agentUsesSkill(agent, skill.id));
                const skillAuditEvents = auditEvents.filter((event) => event.skillId === skill.id).slice(0, 3);
                const pendingActionForSkill = pendingSkill?.id === skill.id ? pendingImpactAction : null;
                const detailPopoverId = `skillhub-detail-${skill.id}`;
                const detailOpen = openDetailSkillId === skill.id;
                return (
                  <article className={`skillhub-card ${installed ? "skillhub-card--downloaded" : ""}`} key={skill.id}>
                  <div className="skillhub-card-top">
                    <span>{skill.category}</span>
                    <strong>{skill.maturity === "stable" ? "Stable" : "Beta"}</strong>
                  </div>
                  <div className="skillhub-card-top skillhub-card-source">
                    <span>{sourceLabel(skill.registrySource)}</span>
                    <strong>{skill.deprecated ? "deprecated" : skill.status}</strong>
                  </div>
                  <div className="skillhub-card-title">
                    <h2>{skill.name}</h2>
                    <span>
                      {skill.publisher.verified ? <BadgeCheck size={14} strokeWidth={2.4} aria-hidden="true" /> : null}
                      {skill.publisher.name}
                    </span>
                  </div>
                  <p>{skill.summary}</p>
                  <div className="skillhub-market-meta" aria-label={`${skill.name} 市场指标`}>
                    <span>
                      <Download size={14} strokeWidth={2.2} aria-hidden="true" />
                      {compactNumber(skill.downloads)}
                    </span>
                    <span>
                      <Star size={14} strokeWidth={2.2} aria-hidden="true" />
                      {skill.rating === null ? "暂无评分" : skill.rating.toFixed(1)}
                    </span>
                    <span>
                      <Hash size={14} strokeWidth={2.2} aria-hidden="true" />
                      {skill.packageSha256 ? "Hash verified" : "No hash"}
                    </span>
                  </div>
                  <div className="skillhub-card-spec">
                    <span>
                      <Layers3 size={14} strokeWidth={2.2} aria-hidden="true" />
                      {skill.runtime}
                    </span>
                    <span>
                      <ShieldCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                      {skill.permissions.join(" / ")}
                    </span>
                  </div>
                  <div className="skillhub-tags" aria-label={`${skill.name} 标签`}>
                    {skill.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="skillhub-card-meta">
                    <span>v{skill.version}</span>
                    <span>{skill.updatedAt}</span>
                  </div>
                  {installed && skill.previousInstalledVersion ? (
                    <div className="skillhub-rollback-note">
                      <span>可回滚到 v{skill.previousInstalledVersion}</span>
                    </div>
                  ) : null}
                  <div className="skillhub-card-detail">
                    <button
                      className="skillhub-detail-action"
                      type="button"
                      aria-controls={detailPopoverId}
                      aria-expanded={detailOpen}
                      onClick={() => setOpenDetailSkillId((current) => (current === skill.id ? null : skill.id))}
                    >
                      <Info size={15} strokeWidth={2.4} aria-hidden="true" />
                      <span>详情</span>
                    </button>
                    <div
                      className={`skillhub-detail-popover ${detailOpen ? "skillhub-detail-popover--open" : ""}`}
                      id={detailPopoverId}
                      aria-label={`${skill.name} 详情`}
                    >
                      <div className="skillhub-detail-header">
                        <span>Skill detail</span>
                        <strong>{skill.name}</strong>
                      </div>
                      <p>{skill.description || skill.summary}</p>
                      <dl className="skillhub-detail-list">
                        <div>
                          <dt>当前版本</dt>
                          <dd>{versionLabel(skill.version)}</dd>
                        </div>
                        <div>
                          <dt>已安装版本</dt>
                          <dd>{installedVersionLabel(skill)}</dd>
                        </div>
                        <div>
                          <dt>上一版本</dt>
                          <dd>{versionLabel(skill.previousInstalledVersion)}</dd>
                        </div>
                        <div>
                          <dt>安装时间</dt>
                          <dd>{installedAtLabel(skill.installedAt)}</dd>
                        </div>
                        <div>
                          <dt>Package hash</dt>
                          <dd>{skill.packageSha256 || "未提供 hash"}</dd>
                        </div>
                      </dl>
                      <div className="skillhub-detail-section">
                        <strong>权限</strong>
                        <div className="skillhub-detail-pills">
                          {skill.permissions.map((permission) => (
                            <span key={permission}>{permission}</span>
                          ))}
                        </div>
                      </div>
                      <div className="skillhub-detail-section">
                        <strong>校验</strong>
                        {skill.validationErrors.length > 0 ? (
                          <ul className="skillhub-detail-errors">
                            {skill.validationErrors.map((error) => (
                              <li key={error}>
                                <AlertTriangle size={14} strokeWidth={2.4} aria-hidden="true" />
                                <span>{error}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="skillhub-detail-muted">未发现校验错误</span>
                        )}
                      </div>
                      <div className="skillhub-detail-section">
                        <strong>使用中的 Agent</strong>
                        {skillAgents.length > 0 ? (
                          <div className="skillhub-agent-impact-list">
                            <span>{skillAgents.length} 个 Agent 正在绑定</span>
                            {skillAgents.map((agent) => {
                              const version = agentBindingVersion(agent, skill.id);
                              return (
                                <div className="skillhub-agent-impact-item" key={agent.id}>
                                  <strong>{agent.name}</strong>
                                  <small>{version ? `锁定 ${versionLabel(version)}` : "未锁定版本"}</small>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="skillhub-detail-muted">当前没有 Agent 绑定这个 Skill</span>
                        )}
                      </div>
                      <div className="skillhub-detail-section">
                        <strong>审计日志</strong>
                        {skillAuditEvents.length > 0 ? (
                          <div className="skillhub-audit-list">
                            {skillAuditEvents.map((event) => (
                              <div className={`skillhub-audit-item ${event.ok ? "" : "skillhub-audit-item--failed"}`} key={event.id}>
                                <span>{event.ok ? auditActionLabel(event.action) : `${auditActionLabel(event.action)}失败`}</span>
                                <strong>{versionLabel(event.version)}</strong>
                                <small>
                                  {event.ok ? event.status : event.code || "FAILED"} · {eventTimeLabel(event.at)}
                                </small>
                                {!event.ok && event.message ? <em>{event.message}</em> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="skillhub-detail-muted">当前没有审计事件</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {pendingActionForSkill ? (
                    <div className="skillhub-impact-confirmation" role="alert">
                      <div>
                        <strong>确认{pendingActionForSkill.kind === "rollback" ? "回滚" : skillActionLabel(skill)}</strong>
                        <span>{pendingSkillAgents.length} 个 Agent 会受到影响</span>
                      </div>
                      <div className="skillhub-impact-confirmation-list">
                        {pendingSkillAgents.map((agent) => {
                          const version = agentBindingVersion(agent, skill.id);
                          return (
                            <span key={agent.id}>
                              {agent.name}
                              <small>{version ? versionLabel(version) : "未锁定版本"}</small>
                            </span>
                          );
                        })}
                      </div>
                      <div className="skillhub-impact-confirmation-actions">
                        <button type="button" onClick={() => setPendingImpactAction(null)}>
                          取消
                        </button>
                        <button type="button" onClick={confirmPendingImpactAction}>
                          确认{pendingActionForSkill.kind === "rollback" ? "回滚" : skillActionLabel(skill)}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <button
                    className="skillhub-action"
                    type="button"
                    aria-busy={isSkillOperationRunning(skill, "primary")}
                    disabled={hasSkillOperationInFlight || isPrimarySkillActionDisabled(skill)}
                    onClick={() => requestSkillAction(skill)}
                  >
                    {skill.status === "available" ? (
                      <>
                        <Download size={16} strokeWidth={2.4} aria-hidden="true" />
                        <span>{primaryOperationLabel(skill)}</span>
                      </>
                    ) : installed ? (
                      <>
                        <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                        <span>{primaryOperationLabel(skill)}</span>
                      </>
                    ) : (
                      <>
                        <PackageCheck size={16} strokeWidth={2.4} aria-hidden="true" />
                        <span>{primaryOperationLabel(skill)}</span>
                      </>
                    )}
                  </button>
                  {installed && skill.previousInstalledVersion ? (
                    <button
                      className="skillhub-rollback-action"
                      type="button"
                      aria-busy={isSkillOperationRunning(skill, "rollback")}
                      disabled={hasSkillOperationInFlight}
                      onClick={() => requestRollbackSkill(skill)}
                    >
                      <RotateCcw size={15} strokeWidth={2.4} aria-hidden="true" />
                      <span>{isSkillOperationRunning(skill, "rollback") ? "处理中" : "回滚"}</span>
                    </button>
                  ) : null}
                </article>
                );
              })}
              {filteredSkills.length === 0 ? (
                <div className="skillhub-empty">
                  <Search size={22} strokeWidth={2.2} aria-hidden="true" />
                  <strong>没有匹配的 Skill</strong>
                  <span>调整关键词或筛选条件后再试。</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
