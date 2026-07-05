import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CircleHelp,
  Download,
  Hash,
  HeartPulse,
  Info,
  Layers3,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
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
const lifecycleStatuses: SkillRegistryItem["status"][] = ["available", "downloaded", "installed", "updateAvailable", "invalid"];
const registrySources: SkillRegistryItem["registrySource"][] = ["official", "verified", "community", "private", "local"];
const maturityLevels: SkillRegistryItem["maturity"][] = ["stable", "beta"];
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

function registryReadinessLabel(registrySettings: RemoteRegistrySettings | null): string {
  if (!registrySettings) {
    return "等待同步";
  }
  return registrySettings.lastSyncError ? "需要关注" : "Registry synced";
}

function readinessStatusLabel(readiness: SkillHubReadiness | null, registrySettings: RemoteRegistrySettings | null): string {
  if (!readiness) {
    return registryReadinessLabel(registrySettings);
  }
  const labels: Record<SkillHubReadiness["status"], string> = {
    ready: "Production ready",
    degraded: "需要关注",
    blocked: "不可用",
  };
  return labels[readiness.status];
}

function readinessDetailLabel(readiness: SkillHubReadiness | null, registrySettings: RemoteRegistrySettings | null): string {
  if (!readiness) {
    return registryDetailLabel(registrySettings);
  }
  if (!readiness.store.readable) {
    return readiness.store.message || "本地 Skill store 不可读。";
  }
  if (readiness.registry.lastSyncError) {
    return readiness.registry.lastSyncError;
  }
  return registryDetailLabel(readiness.registry);
}

function registryDetailLabel(registrySettings: RemoteRegistrySettings | null): string {
  if (!registrySettings) {
    return "正在等待 registry 状态。";
  }
  if (registrySettings.lastSyncError) {
    return registrySettings.lastSyncError;
  }
  if (!registrySettings.lastSyncedAt) {
    return "尚未同步 registry。";
  }
  return `上次同步 ${eventTimeLabel(registrySettings.lastSyncedAt)}`;
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

function statusLabel(status: SkillRegistryItem["status"]): string {
  const labels: Record<SkillRegistryItem["status"], string> = {
    available: "可下载",
    downloaded: "已下载",
    installed: "已安装",
    updateAvailable: "可升级",
    invalid: "不可用",
  };
  return labels[status];
}

function maturityLabel(maturity: SkillRegistryItem["maturity"]): string {
  return maturity === "stable" ? "Stable" : "Beta";
}

function agentBindingVersion(agent: AgentProfile, skillId: string): string {
  const binding = agent.skills.find((skill) => skill.skillId === skillId);
  return binding?.version || "";
}

function agentUsesSkill(agent: AgentProfile, skillId: string): boolean {
  return agent.skills.some((skill) => skill.skillId === skillId) || agent.skillIds.includes(skillId);
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
  return skills.filter((skill) => {
    const keyword = filters.query.trim().toLowerCase();
    const matchesKeyword =
      !keyword ||
      `${skill.name} ${skill.summary} ${skill.provider} ${skill.publisher.name} ${skill.registrySource} ${skill.runtime} ${skill.tags.join(" ")}`
        .toLowerCase()
        .includes(keyword);
    const matchesCategory = filters.category === allCategories || skill.category === filters.category;
    const matchesStatus = filters.status === allStatuses || skill.status === filters.status;
    const matchesSource = filters.source === allSources || skill.registrySource === filters.source;
    const matchesMaturity = filters.maturity === allMaturities || skill.maturity === filters.maturity;
    const matchesLoaded = !filters.loadedOnly || skill.installed;
    return matchesKeyword && matchesCategory && matchesStatus && matchesSource && matchesMaturity && matchesLoaded;
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
  readiness,
  registrySettings,
  registryRefreshing,
  skillOperationInFlight,
  skills,
  onRefreshRegistry,
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
  const [activeCategory, setActiveCategory] = useState(allCategories);
  const [activeStatus, setActiveStatus] = useState(allStatuses);
  const [activeSource, setActiveSource] = useState(allSources);
  const [activeMaturity, setActiveMaturity] = useState(allMaturities);
  const [showLoadedOnly, setShowLoadedOnly] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [customPackageText, setCustomPackageText] = useState("");
  const [customPackageError, setCustomPackageError] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [pendingImpactAction, setPendingImpactAction] = useState<PendingSkillImpactAction | null>(null);
  const installedCount = readiness?.counts.installed ?? skills.filter((skill) => skill.installed).length;
  const updateAvailableCount = readiness?.counts.updateAvailable ?? skills.filter((skill) => skill.status === "updateAvailable").length;
  const failedAuditCount = readiness?.counts.failedAudit ?? auditEvents.filter((event) => !event.ok).length;
  const readinessTone = readiness
    ? readiness.status === "ready"
      ? "ok"
      : "warning"
    : !registrySettings
      ? "waiting"
      : registrySettings.lastSyncError
        ? "warning"
        : "ok";
  const hasSkillOperationInFlight = skillOperationInFlight !== null;
  const categories = useMemo(() => [allCategories, ...new Set(skills.map((skill) => skill.category))], [skills]);
  const filteredSkills = filterSkillRegistry(skills, {
    query,
    category: activeCategory,
    status: activeStatus,
    source: activeSource,
    maturity: activeMaturity,
    loadedOnly: showLoadedOnly,
  });
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId) ?? filteredSkills[0] ?? null;
  const showDetailPanel = detailOpen && selectedSkill !== null;
  const selectedSkillAgents = selectedSkill ? agents.filter((agent) => agentUsesSkill(agent, selectedSkill.id)) : [];
  const selectedSkillAuditEvents = selectedSkill
    ? auditEvents.filter((event) => event.skillId === selectedSkill.id).slice(0, 5)
    : [];
  const pendingSkill = pendingImpactAction ? skills.find((skill) => skill.id === pendingImpactAction.skillId) ?? null : null;
  const pendingSkillAgents = pendingSkill ? agents.filter((agent) => agentUsesSkill(agent, pendingSkill.id)) : [];
  const sourceOverview = registrySources.map((source) => ({
    key: source,
    label: sourceLabel(source),
    count: skills.filter((skill) => skill.registrySource === source).length,
  }));
  const statusOverview = lifecycleStatuses.map((status) => ({
    key: status,
    label: statusLabel(status),
    count: skills.filter((skill) => skill.status === status).length,
  }));
  const recentAuditEvents = auditEvents.slice(0, 6);

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

  function openSkillDetail(skill: SkillRegistryItem): void {
    setSelectedSkillId(skill.id);
    setDetailOpen(true);
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
      setSelectedSkillId(skill.id);
      setDetailOpen(true);
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
      setSelectedSkillId(skill.id);
      setDetailOpen(true);
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

      <section className={`skillhub-readiness skillhub-readiness--${readinessTone}`} aria-label="SkillHub 健康摘要">
        <div className="skillhub-readiness-main">
          <HeartPulse size={18} strokeWidth={2.4} aria-hidden="true" />
          <div>
            <span>Hub readiness</span>
            <strong>{readinessStatusLabel(readiness, registrySettings)}</strong>
            <small>{readinessDetailLabel(readiness, registrySettings)}</small>
          </div>
        </div>
        <div className="skillhub-readiness-metrics">
          <span>
            <strong>{installedCount}</strong>
            已安装
          </span>
          <span>
            <strong>{updateAvailableCount}</strong>
            可升级
          </span>
          <span>
            <strong>{failedAuditCount}</strong>
            失败事件
          </span>
        </div>
        <button className="skillhub-refresh-action" type="button" disabled={registryRefreshing} onClick={onRefreshRegistry}>
          <RefreshCw size={15} strokeWidth={2.4} aria-hidden="true" />
          <span>{registryRefreshing ? "同步中" : "刷新 registry"}</span>
        </button>
      </section>

      <section className="skillhub-overview" aria-label="SkillHub 分布概览">
        <div className="skillhub-overview-heading">
          <strong>Hub overview</strong>
          <span>{skills.length} 个 Skill across sources and lifecycle states</span>
        </div>
        <div className="skillhub-overview-group" aria-label="来源分布">
          {sourceOverview
            .filter((item) => item.count > 0)
            .map((item) => (
              <span key={item.key}>
                {item.label}
                <strong>{item.count}</strong>
              </span>
            ))}
        </div>
        <div className="skillhub-overview-group" aria-label="状态分布">
          {statusOverview
            .filter((item) => item.count > 0)
            .map((item) => (
              <span key={item.key}>
                {item.label}
                <strong>{item.count}</strong>
              </span>
            ))}
        </div>
      </section>

      <section className="skillhub-workbench" aria-label="Skill 注册表">
        <aside className="skillhub-filter-panel" aria-label="Skill 筛选">
          <div className="skillhub-filter-topline">
            <div className="skillhub-filter-heading">
              <SlidersHorizontal size={16} strokeWidth={2.3} aria-hidden="true" />
              <strong>Skill filters</strong>
            </div>
            <div className="skillhub-search">
              <Search size={16} strokeWidth={2.2} aria-hidden="true" />
              <input value={query} placeholder="搜索 skill、来源或标签" onChange={(event) => setQuery(event.currentTarget.value)} />
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
          <div className="skillhub-category-list" aria-label="Skill 分类">
            {categories.map((category) => (
              <button
                className={`skillhub-category ${activeCategory === category ? "skillhub-category--active" : ""}`}
                key={category}
                type="button"
                aria-pressed={activeCategory === category}
                onClick={() => setActiveCategory(category)}
              >
                <span>{category}</span>
                <small>
                  {category === allCategories
                    ? skills.length
                    : skills.filter((skill) => skill.category === category).length}
                </small>
              </button>
            ))}
          </div>
          <div className="skillhub-filter-groups" aria-label="生产筛选">
            <div className="skillhub-filter-group">
              <strong>Status filters</strong>
              <div>
                <button
                  className={`skillhub-filter-chip ${activeStatus === allStatuses ? "skillhub-filter-chip--active" : ""}`}
                  type="button"
                  aria-pressed={activeStatus === allStatuses}
                  onClick={() => setActiveStatus(allStatuses)}
                >
                  {allStatuses}
                </button>
                {lifecycleStatuses.map((status) => (
                  <button
                    className={`skillhub-filter-chip ${activeStatus === status ? "skillhub-filter-chip--active" : ""}`}
                    type="button"
                    key={status}
                    aria-pressed={activeStatus === status}
                    onClick={() => setActiveStatus(status)}
                  >
                    {statusLabel(status)}
                    <small>{skills.filter((skill) => skill.status === status).length}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="skillhub-filter-group">
              <strong>Source filters</strong>
              <div>
                <button
                  className={`skillhub-filter-chip ${activeSource === allSources ? "skillhub-filter-chip--active" : ""}`}
                  type="button"
                  aria-pressed={activeSource === allSources}
                  onClick={() => setActiveSource(allSources)}
                >
                  {allSources}
                </button>
                {registrySources.map((source) => (
                  <button
                    className={`skillhub-filter-chip ${activeSource === source ? "skillhub-filter-chip--active" : ""}`}
                    type="button"
                    key={source}
                    aria-pressed={activeSource === source}
                    onClick={() => setActiveSource(source)}
                  >
                    {sourceLabel(source)}
                    <small>{skills.filter((skill) => skill.registrySource === source).length}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="skillhub-filter-group">
              <strong>Maturity filters</strong>
              <div>
                <button
                  className={`skillhub-filter-chip ${activeMaturity === allMaturities ? "skillhub-filter-chip--active" : ""}`}
                  type="button"
                  aria-pressed={activeMaturity === allMaturities}
                  onClick={() => setActiveMaturity(allMaturities)}
                >
                  {allMaturities}
                </button>
                {maturityLevels.map((maturity) => (
                  <button
                    className={`skillhub-filter-chip ${activeMaturity === maturity ? "skillhub-filter-chip--active" : ""}`}
                    type="button"
                    key={maturity}
                    aria-pressed={activeMaturity === maturity}
                    onClick={() => setActiveMaturity(maturity)}
                  >
                    {maturityLabel(maturity)}
                    <small>{skills.filter((skill) => skill.maturity === maturity).length}</small>
                  </button>
                ))}
              </div>
            </div>
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
          <div className="skillhub-operations-panel" aria-label="近期 Skill 操作">
            <div className="skillhub-panel-title">
              <span>
                <RefreshCw size={15} strokeWidth={2.4} aria-hidden="true" />
                <strong>Recent operations</strong>
              </span>
              <small>{auditEvents.length} 条</small>
            </div>
            {recentAuditEvents.length > 0 ? (
              <div className="skillhub-audit-list">
                {recentAuditEvents.map((event) => (
                  <div className={`skillhub-audit-item ${event.ok ? "" : "skillhub-audit-item--failed"}`} key={event.id}>
                    <span>{event.ok ? auditActionLabel(event.action) : `${auditActionLabel(event.action)}失败`}</span>
                    <strong>{event.skillName}</strong>
                    <small>
                      {event.ok ? event.status : event.code || "FAILED"} · {eventTimeLabel(event.at)}
                    </small>
                    {!event.ok && event.message ? <em>{event.message}</em> : null}
                  </div>
                ))}
              </div>
            ) : (
              <span className="skillhub-detail-muted">暂无近期操作</span>
            )}
          </div>
        </aside>

        <section className="skillhub-registry" aria-label="可用 Skill">
          <div className="skillhub-registry-bar">
            <span>{filteredSkills.length} 个结果</span>
            <small>{activeCategory === allCategories ? "全部分类" : activeCategory}</small>
          </div>

          <div className={`skillhub-registry-body ${showDetailPanel ? "skillhub-registry-body--with-detail" : ""}`}>
            <div className="skillhub-grid">
              {filteredSkills.map((skill) => {
                const installed = skill.installed;
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
                  <button
                    className="skillhub-detail-action"
                    type="button"
                    aria-pressed={detailOpen && selectedSkill?.id === skill.id}
                    onClick={() => openSkillDetail(skill)}
                  >
                    <Info size={15} strokeWidth={2.4} aria-hidden="true" />
                    <span>详情</span>
                  </button>
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
            {showDetailPanel ? (
              <aside className="skillhub-detail-panel" aria-label={`${selectedSkill.name} 详情`}>
                <div className="skillhub-detail-header">
                  <div>
                    <span>Skill detail</span>
                    <h2>{selectedSkill.name}</h2>
                  </div>
                  <button className="skillhub-detail-close" type="button" aria-label="关闭 Skill 详情" onClick={() => setDetailOpen(false)}>
                    <X size={16} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>
                <div className="skillhub-detail-badges">
                  <span>{sourceLabel(selectedSkill.registrySource)}</span>
                  <span>{selectedSkill.status}</span>
                  <span>{selectedSkill.maturity === "stable" ? "Stable" : "Beta"}</span>
                </div>
                <p>{selectedSkill.description || selectedSkill.summary}</p>
                <dl className="skillhub-detail-list">
                  <div>
                    <dt>当前版本</dt>
                    <dd>{versionLabel(selectedSkill.version)}</dd>
                  </div>
                  <div>
                    <dt>已安装版本</dt>
                    <dd>{installedVersionLabel(selectedSkill)}</dd>
                  </div>
                  <div>
                    <dt>可用版本</dt>
                    <dd>{versionLabel(selectedSkill.availableVersion || selectedSkill.version)}</dd>
                  </div>
                  <div>
                    <dt>上一版本</dt>
                    <dd>{versionLabel(selectedSkill.previousInstalledVersion)}</dd>
                  </div>
                  <div>
                    <dt>安装时间</dt>
                    <dd>{installedAtLabel(selectedSkill.installedAt)}</dd>
                  </div>
                  <div>
                    <dt>入口文件</dt>
                    <dd>{selectedSkill.entry}</dd>
                  </div>
                  <div>
                    <dt>Package hash</dt>
                    <dd>{selectedSkill.packageSha256 || "未提供 hash"}</dd>
                  </div>
                </dl>
                <div className="skillhub-detail-section">
                  <strong>权限</strong>
                  <div className="skillhub-detail-pills">
                    {selectedSkill.permissions.map((permission) => (
                      <span key={permission}>{permission}</span>
                    ))}
                  </div>
                </div>
                <div className="skillhub-detail-section">
                  <strong>标签</strong>
                  <div className="skillhub-detail-pills">
                    {selectedSkill.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="skillhub-detail-section">
                  <strong>校验</strong>
                  {selectedSkill.validationErrors.length > 0 ? (
                    <ul className="skillhub-detail-errors">
                      {selectedSkill.validationErrors.map((error) => (
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
                  {selectedSkillAgents.length > 0 ? (
                    <div className="skillhub-agent-impact-list">
                      <span>{selectedSkillAgents.length} 个 Agent 正在绑定</span>
                      {selectedSkillAgents.map((agent) => {
                        const version = agentBindingVersion(agent, selectedSkill.id);
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
                  {selectedSkillAuditEvents.length > 0 ? (
                    <div className="skillhub-audit-list">
                      {selectedSkillAuditEvents.map((event) => (
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
                {pendingSkill?.id === selectedSkill.id && pendingImpactAction ? (
                  <div className="skillhub-impact-confirmation" role="alert">
                    <div>
                      <strong>确认{pendingImpactAction.kind === "rollback" ? "回滚" : skillActionLabel(selectedSkill)}</strong>
                      <span>{pendingSkillAgents.length} 个 Agent 会受到影响</span>
                    </div>
                    <div className="skillhub-impact-confirmation-list">
                      {pendingSkillAgents.map((agent) => {
                        const version = agentBindingVersion(agent, selectedSkill.id);
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
                        确认{pendingImpactAction.kind === "rollback" ? "回滚" : skillActionLabel(selectedSkill)}
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="skillhub-detail-actions">
                  <button
                    className="skillhub-action"
                    type="button"
                    aria-busy={isSkillOperationRunning(selectedSkill, "primary")}
                    disabled={hasSkillOperationInFlight || isPrimarySkillActionDisabled(selectedSkill)}
                    onClick={() => requestSkillAction(selectedSkill)}
                  >
                    <PackageCheck size={15} strokeWidth={2.4} aria-hidden="true" />
                    <span>{primaryOperationLabel(selectedSkill)}</span>
                  </button>
                  {selectedSkill.installed && selectedSkill.previousInstalledVersion ? (
                    <button
                      className="skillhub-rollback-action"
                      type="button"
                      aria-busy={isSkillOperationRunning(selectedSkill, "rollback")}
                      disabled={hasSkillOperationInFlight}
                      onClick={() => requestRollbackSkill(selectedSkill)}
                    >
                      <RotateCcw size={15} strokeWidth={2.4} aria-hidden="true" />
                      <span>
                        {isSkillOperationRunning(selectedSkill, "rollback")
                          ? "处理中"
                          : `回滚到 ${versionLabel(selectedSkill.previousInstalledVersion)}`}
                      </span>
                    </button>
                  ) : null}
                </div>
              </aside>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
