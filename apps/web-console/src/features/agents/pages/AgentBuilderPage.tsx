import { Check, Plus } from "lucide-react";
import {
  agentSkillCatalog,
  agentSopCatalog,
  toggleAgentBuilderId,
  type AgentBuilderConfig,
} from "../../../agent-builder";

export function AgentBuilderPage({
  config,
  onConfigChange,
}: {
  config: AgentBuilderConfig;
  onConfigChange: (config: AgentBuilderConfig) => void;
}) {
  const selectedSkills = agentSkillCatalog.filter((skill) => config.selectedSkillIds.includes(skill.id));
  const selectedSopSteps = agentSopCatalog.filter((step) => config.selectedSopStepIds.includes(step.id));
  const readinessScore = Math.round(
    ((selectedSkills.length / agentSkillCatalog.length + selectedSopSteps.length / agentSopCatalog.length) / 2) * 100,
  );

  function toggleSkill(skillId: string): void {
    onConfigChange({
      ...config,
      selectedSkillIds: toggleAgentBuilderId(
        config.selectedSkillIds,
        skillId,
        agentSkillCatalog.map((skill) => skill.id),
      ),
    });
  }

  function toggleSopStep(stepId: string): void {
    onConfigChange({
      ...config,
      selectedSopStepIds: toggleAgentBuilderId(
        config.selectedSopStepIds,
        stepId,
        agentSopCatalog.map((step) => step.id),
      ),
    });
  }

  return (
    <main className="builder-shell">
      <header className="builder-hero">
        <div className="builder-hero-copy">
          <span>Agent Builder</span>
          <h1>Agent 工坊</h1>
          <p>选择技能与 SOP，形成可复用 Agent。</p>
        </div>
        <div className="builder-status-panel" aria-label="Agent 配置就绪度">
          <strong>{readinessScore}%</strong>
          <span>配置就绪度</span>
        </div>
      </header>

      <section className="builder-workbench" aria-label="Agent 装配台">
        <div className="builder-column">
          <div className="builder-section-heading">
            <span>Skill 池</span>
            <strong>{selectedSkills.length} 已选</strong>
          </div>
          <div className="builder-card-list">
            {agentSkillCatalog.map((skill) => {
              const selected = config.selectedSkillIds.includes(skill.id);
              return (
                <button
                  className={`builder-skill-card ${selected ? "builder-skill-card--selected" : ""}`}
                  key={skill.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleSkill(skill.id)}
                >
                  <span className="builder-card-topline">
                    <span>{skill.category}</span>
                    <span className="builder-card-check">
                      {selected ? (
                        <Check size={14} strokeWidth={2.8} aria-hidden="true" />
                      ) : (
                        <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                      )}
                    </span>
                  </span>
                  <strong>{skill.name}</strong>
                  <small>{skill.summary}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="builder-column builder-column--wide">
          <div className="builder-section-heading">
            <span>SOP 编排</span>
            <strong>{selectedSopSteps.length} 步</strong>
          </div>
          <div className="builder-sop-list">
            {agentSopCatalog.map((step, index) => {
              const selected = config.selectedSopStepIds.includes(step.id);
              return (
                <button
                  className={`builder-sop-step ${selected ? "builder-sop-step--selected" : ""}`}
                  key={step.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleSopStep(step.id)}
                >
                  <span className="builder-sop-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="builder-sop-copy">
                    <strong>{step.title}</strong>
                    <small>{step.summary}</small>
                  </span>
                  <span className="builder-card-check">
                    {selected ? (
                      <Check size={14} strokeWidth={2.8} aria-hidden="true" />
                    ) : (
                      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="builder-preview" aria-label="Agent 配置预览">
          <div className="builder-section-heading">
            <span>Agent 预览</span>
            <strong>本地草稿</strong>
          </div>

          <label className="builder-field">
            <span>Agent 名称</span>
            <input
              maxLength={36}
              value={config.name}
              onChange={(event) => onConfigChange({ ...config, name: event.currentTarget.value })}
            />
          </label>

          <label className="builder-field">
            <span>适用场景</span>
            <textarea
              maxLength={120}
              rows={4}
              value={config.scenario}
              onChange={(event) => onConfigChange({ ...config, scenario: event.currentTarget.value })}
            />
          </label>

          <div className="builder-preview-group">
            <span>已装配技能</span>
            <div className="builder-token-list">
              {selectedSkills.length > 0 ? selectedSkills.map((skill) => <strong key={skill.id}>{skill.name}</strong>) : <small>尚未选择 skill</small>}
            </div>
          </div>

          <div className="builder-preview-group">
            <span>SOP 流程</span>
            <ol className="builder-preview-steps">
              {selectedSopSteps.length > 0 ? (
                selectedSopSteps.map((step) => <li key={step.id}>{step.title}</li>)
              ) : (
                <li>尚未选择 SOP 步骤</li>
              )}
            </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}
