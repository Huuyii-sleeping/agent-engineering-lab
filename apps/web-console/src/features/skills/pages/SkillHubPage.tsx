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
  SlidersHorizontal,
  Star,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SkillPackageInput, SkillRegistryItem } from "../../../api";

const allCategories = "全部";
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

/** Render the local registry of skills that can be loaded into agents. */
export function SkillHubPage({
  skills,
  onRollbackSkill,
  onSkillAction,
  onUploadPackage,
}: {
  skills: SkillRegistryItem[];
  onRollbackSkill: (skill: SkillRegistryItem) => void;
  onSkillAction: (skill: SkillRegistryItem) => void;
  onUploadPackage: (input: SkillPackageInput) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(allCategories);
  const [showLoadedOnly, setShowLoadedOnly] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [customPackageText, setCustomPackageText] = useState("");
  const [customPackageError, setCustomPackageError] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
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
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId) ?? filteredSkills[0] ?? null;
  const showDetailPanel = detailOpen && selectedSkill !== null;

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

  function openSkillDetail(skill: SkillRegistryItem): void {
    setSelectedSkillId(skill.id);
    setDetailOpen(true);
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
                  {installed && skill.previousInstalledVersion ? (
                    <button className="skillhub-rollback-action" type="button" onClick={() => onRollbackSkill(skill)}>
                      <RotateCcw size={15} strokeWidth={2.4} aria-hidden="true" />
                      <span>回滚</span>
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
                <div className="skillhub-detail-actions">
                  <button className="skillhub-action" type="button" onClick={() => onSkillAction(selectedSkill)}>
                    <PackageCheck size={15} strokeWidth={2.4} aria-hidden="true" />
                    <span>{actionLabel(selectedSkill)}</span>
                  </button>
                  {selectedSkill.installed && selectedSkill.previousInstalledVersion ? (
                    <button className="skillhub-rollback-action" type="button" onClick={() => onRollbackSkill(selectedSkill)}>
                      <RotateCcw size={15} strokeWidth={2.4} aria-hidden="true" />
                      <span>回滚到 {versionLabel(selectedSkill.previousInstalledVersion)}</span>
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
