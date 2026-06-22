import { Check, Download, Layers3, PackageCheck, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { agentSkillCatalog } from "../../../agent-builder";

const allCategories = "全部";

/** Render the local registry of skills that can be loaded into agents. */
export function SkillHubPage({
  downloadedSkillIds,
  onToggleSkill,
}: {
  downloadedSkillIds: string[];
  onToggleSkill: (skillId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(allCategories);
  const [showLoadedOnly, setShowLoadedOnly] = useState(false);
  const downloadedCount = downloadedSkillIds.length;
  const categories = useMemo(() => [allCategories, ...new Set(agentSkillCatalog.map((skill) => skill.category))], []);
  const filteredSkills = agentSkillCatalog.filter((skill) => {
    const keyword = query.trim().toLowerCase();
    const matchesKeyword =
      !keyword ||
      `${skill.name} ${skill.summary} ${skill.provider} ${skill.runtime} ${skill.tags.join(" ")}`.toLowerCase().includes(keyword);
    const matchesCategory = activeCategory === allCategories || skill.category === activeCategory;
    const matchesLoaded = !showLoadedOnly || downloadedSkillIds.includes(skill.id);
    return matchesKeyword && matchesCategory && matchesLoaded;
  });
  const stableCount = agentSkillCatalog.filter((skill) => skill.maturity === "stable").length;

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
            <strong>{agentSkillCatalog.length}</strong>
            <small>可用 Skill</small>
          </span>
          <span>
            <strong>{downloadedCount}</strong>
            <small>已加载</small>
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
                    ? agentSkillCatalog.length
                    : agentSkillCatalog.filter((skill) => skill.category === category).length}
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
            <span>只看已加载</span>
          </button>
        </aside>

        <section className="skillhub-registry" aria-label="可用 Skill">
          <div className="skillhub-registry-bar">
            <span>{filteredSkills.length} 个结果</span>
            <small>{activeCategory === allCategories ? "全部分类" : activeCategory}</small>
          </div>

          <div className="skillhub-grid">
            {filteredSkills.map((skill) => {
              const downloaded = downloadedSkillIds.includes(skill.id);
              return (
                <article className={`skillhub-card ${downloaded ? "skillhub-card--downloaded" : ""}`} key={skill.id}>
                  <div className="skillhub-card-top">
                    <span>{skill.category}</span>
                    <strong>{skill.maturity === "stable" ? "Stable" : "Beta"}</strong>
                  </div>
                  <div className="skillhub-card-title">
                    <h2>{skill.name}</h2>
                    <span>{skill.provider}</span>
                  </div>
                  <p>{skill.summary}</p>
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
                  <button className="skillhub-action" type="button" onClick={() => onToggleSkill(skill.id)}>
                    {downloaded ? (
                      <>
                        <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                        <span>已加载</span>
                      </>
                    ) : (
                      <>
                        <Download size={16} strokeWidth={2.4} aria-hidden="true" />
                        <span>加载 Skill</span>
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
