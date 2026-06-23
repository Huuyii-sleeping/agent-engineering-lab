import {
  BadgeCheck,
  Check,
  Cloud,
  Download,
  Hash,
  Layers3,
  PackageCheck,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RemoteRegistrySettings, SkillPackageInput, SkillRegistryItem } from "../../../api";

const allCategories = "全部";

/** Render the local registry of skills that can be loaded into agents. */
export function SkillHubPage({
  skills,
  remoteRegistry,
  onSkillAction,
  onSyncRemoteRegistry,
  onUpdateRemoteRegistryUrl,
  onUploadPackage,
}: {
  skills: SkillRegistryItem[];
  remoteRegistry: RemoteRegistrySettings | null;
  onSkillAction: (skill: SkillRegistryItem) => void;
  onSyncRemoteRegistry: () => void;
  onUpdateRemoteRegistryUrl: (url: string) => void;
  onUploadPackage: (input: SkillPackageInput) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(allCategories);
  const [showLoadedOnly, setShowLoadedOnly] = useState(false);
  const [remoteRegistryUrl, setRemoteRegistryUrl] = useState(remoteRegistry?.url ?? "");
  const [customPackageText, setCustomPackageText] = useState("");
  const [customPackageError, setCustomPackageError] = useState<string | null>(null);
  const installedCount = skills.filter((skill) => skill.installed).length;
  const localCount = skills.filter((skill) => skill.status !== "available").length;
  const categories = useMemo(() => [allCategories, ...new Set(skills.map((skill) => skill.category))], [skills]);
  const filteredSkills = skills.filter((skill) => {
    const keyword = query.trim().toLowerCase();
    const matchesKeyword =
      !keyword ||
      `${skill.name} ${skill.summary} ${skill.provider} ${skill.publisher.name} ${skill.registrySource} ${skill.runtime} ${skill.tags.join(" ")}`
        .toLowerCase()
        .includes(keyword);
    const matchesCategory = activeCategory === allCategories || skill.category === activeCategory;
    const matchesLoaded = !showLoadedOnly || skill.installed;
    return matchesKeyword && matchesCategory && matchesLoaded;
  });
  const stableCount = skills.filter((skill) => skill.maturity === "stable").length;
  const remoteCount = skills.filter((skill) => skill.sourceType === "remote").length;
  const lastSyncedAt = remoteRegistry?.lastSyncedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(remoteRegistry.lastSyncedAt)
    : "未同步";

  useEffect(() => {
    setRemoteRegistryUrl(remoteRegistry?.url ?? "");
  }, [remoteRegistry?.url]);

  function actionLabel(skill: SkillRegistryItem): string {
    if (skill.deprecated && skill.status === "available") {
      return "已下架";
    }
    if (skill.status === "available") {
      return "下载";
    }
    if (skill.installed) {
      return "已安装";
    }
    if (skill.status === "invalid") {
      return "不可用";
    }
    return "安装";
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

  function compactNumber(value: number): string {
    return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  function handleUpload(): void {
    try {
      const parsed = JSON.parse(customPackageText) as SkillPackageInput;
      setCustomPackageError(null);
      onUploadPackage(parsed);
      setCustomPackageText("");
    } catch {
      setCustomPackageError("请输入合法的 Skill package JSON。");
    }
  }

  return (
    <main className="skillhub-shell">
      <section className="skillhub-hero">
        <div>
          <span>Skill registry</span>
          <h1>Skill Hub</h1>
          <p>管理本地 Agent 可加载的能力包，查看运行域、权限范围、版本和加载状态。</p>
        </div>
        <div className="skillhub-meter" aria-label="Skill Hub 状态">
          <span>
            <strong>{skills.length}</strong>
            <small>可用 Skill</small>
          </span>
          <span>
            <strong>{localCount}</strong>
            <small>已下载</small>
          </span>
          <span>
            <strong>{installedCount}</strong>
            <small>已安装</small>
          </span>
          <span>
            <strong>{stableCount}</strong>
            <small>稳定版</small>
          </span>
        </div>
      </section>

      <section className="skillhub-workbench" aria-label="Skill 注册表">
        <aside className="skillhub-filter-panel" aria-label="Skill 筛选">
          <div className="skillhub-filter-heading">
            <SlidersHorizontal size={16} strokeWidth={2.3} aria-hidden="true" />
            <strong>Registry filters</strong>
          </div>
          <div className="skillhub-search">
            <Search size={16} strokeWidth={2.2} aria-hidden="true" />
            <input value={query} placeholder="搜索 skill、来源或标签" onChange={(event) => setQuery(event.currentTarget.value)} />
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
          <button
            className={`skillhub-loaded-toggle ${showLoadedOnly ? "skillhub-loaded-toggle--active" : ""}`}
            type="button"
            aria-pressed={showLoadedOnly}
            onClick={() => setShowLoadedOnly((current) => !current)}
          >
            <PackageCheck size={16} strokeWidth={2.3} aria-hidden="true" />
            <span>只看已安装</span>
          </button>
          <div className="skillhub-remote-panel" aria-label="远端 Skill Registry">
            <div className="skillhub-panel-title">
              <Cloud size={15} strokeWidth={2.4} aria-hidden="true" />
              <strong>Remote registry</strong>
            </div>
            <label>
              <span>Registry URL</span>
              <input
                value={remoteRegistryUrl}
                placeholder="https://example.com/skills/index.json"
                onChange={(event) => setRemoteRegistryUrl(event.currentTarget.value)}
              />
            </label>
            <div className="skillhub-remote-stats" aria-label="远端同步状态">
              <span>
                <strong>{remoteRegistry?.skillCount ?? remoteCount}</strong>
                <small>远端索引</small>
              </span>
              <span>
                <strong>{remoteCount}</strong>
                <small>当前列表</small>
              </span>
              <span>
                <strong>{lastSyncedAt}</strong>
                <small>最近同步</small>
              </span>
            </div>
            {remoteRegistry?.lastSyncError ? (
              <small className="skillhub-remote-error" role="alert">
                {remoteRegistry.lastSyncError}
              </small>
            ) : null}
            <div className="skillhub-remote-actions">
              <button
                type="button"
                disabled={remoteRegistryUrl.trim() === (remoteRegistry?.url ?? "")}
                onClick={() => onUpdateRemoteRegistryUrl(remoteRegistryUrl)}
              >
                <Save size={14} strokeWidth={2.4} aria-hidden="true" />
                <span>保存地址</span>
              </button>
              <button type="button" onClick={onSyncRemoteRegistry}>
                <RefreshCw size={14} strokeWidth={2.4} aria-hidden="true" />
                <span>同步索引</span>
              </button>
            </div>
          </div>
          <div className="skillhub-upload-panel" aria-label="上传自定义 Skill">
            <div className="skillhub-panel-title">
              <Upload size={15} strokeWidth={2.4} aria-hidden="true" />
              <strong>Custom upload</strong>
            </div>
            <textarea
              value={customPackageText}
              rows={8}
              placeholder='{"files":[{"path":"SKILL.md","content":"---\\nname: my-skill\\ndescription: ..."}]}'
              onChange={(event) => setCustomPackageText(event.currentTarget.value)}
            />
            {customPackageError ? <small role="alert">{customPackageError}</small> : null}
            <button type="button" disabled={!customPackageText.trim()} onClick={handleUpload}>
              <Upload size={15} strokeWidth={2.3} aria-hidden="true" />
              <span>上传 Skill</span>
            </button>
          </div>
        </aside>

        <section className="skillhub-registry" aria-label="可用 Skill">
          <div className="skillhub-registry-bar">
            <span>{filteredSkills.length} 个结果</span>
            <small>{activeCategory === allCategories ? "全部分类" : activeCategory}</small>
          </div>

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
                  <button
                    className="skillhub-action"
                    type="button"
                    disabled={skill.deprecated && skill.status === "available"}
                    onClick={() => onSkillAction(skill)}
                  >
                    {skill.status === "available" ? (
                      <>
                        <Download size={16} strokeWidth={2.4} aria-hidden="true" />
                        <span>{actionLabel(skill)}</span>
                      </>
                    ) : installed ? (
                      <>
                        <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                        <span>{actionLabel(skill)}</span>
                      </>
                    ) : (
                      <>
                        <PackageCheck size={16} strokeWidth={2.4} aria-hidden="true" />
                        <span>{actionLabel(skill)}</span>
                      </>
                    )}
                  </button>
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
        </section>
      </section>
    </main>
  );
}
