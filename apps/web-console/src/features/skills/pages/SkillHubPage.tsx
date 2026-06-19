import { Check, Download } from "lucide-react";
import { agentSkillCatalog } from "../../../agent-builder";

export function SkillHubPage({
  downloadedSkillIds,
  onToggleSkill,
}: {
  downloadedSkillIds: string[];
  onToggleSkill: (skillId: string) => void;
}) {
  const downloadedCount = downloadedSkillIds.length;

  return (
    <main className="skillhub-shell">
      <section className="skillhub-hero">
        <div>
          <span>Skill Hub</span>
          <h1>技能库</h1>
          <p>选择要加载的技能。</p>
        </div>
        <div className="skillhub-meter" aria-label="已下载技能数量">
          <strong>{downloadedCount}</strong>
          <span>已下载</span>
        </div>
      </section>

      <section className="skillhub-grid" aria-label="可用技能">
        {agentSkillCatalog.map((skill) => {
          const downloaded = downloadedSkillIds.includes(skill.id);
          return (
            <article className={`skillhub-card ${downloaded ? "skillhub-card--downloaded" : ""}`} key={skill.id}>
              <div className="skillhub-card-top">
                <span>{skill.category}</span>
                <strong>{skill.provider}</strong>
              </div>
              <h2>{skill.name}</h2>
              <p>{skill.summary}</p>
              <div className="skillhub-card-meta">
                <span>v{skill.version}</span>
                <span>{downloaded ? "已加载" : "可下载"}</span>
              </div>
              <button className="skillhub-action" type="button" onClick={() => onToggleSkill(skill.id)}>
                {downloaded ? (
                  <>
                    <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                    <span>已下载</span>
                  </>
                ) : (
                  <>
                    <Download size={16} strokeWidth={2.4} aria-hidden="true" />
                    <span>下载 Skill</span>
                  </>
                )}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}
