import { Check, Plus } from "lucide-react";
import { agentSkillCatalog, agentSopCatalog, toggleAgentBuilderId, type AgentBuilderConfig } from "../../../agent-builder";

export function BuilderView({
  active,
  config,
  onConfigChange,
  onSaveDraft,
}: {
  active: boolean;
  config: AgentBuilderConfig;
  onConfigChange: (config: AgentBuilderConfig) => void;
  onSaveDraft: () => void;
}) {
  const selectedSkills = agentSkillCatalog.filter((skill) => config.selectedSkillIds.includes(skill.id));
  const selectedSopSteps = agentSopCatalog.filter((step) => config.selectedSopStepIds.includes(step.id));
  const readinessScore = Math.round(
    ((selectedSkills.length / Math.max(agentSkillCatalog.length, 1) +
      selectedSopSteps.length / Math.max(agentSopCatalog.length, 1)) /
      2) *
      100,
  );
  const readinessMissing: string[] = [];
  if (selectedSkills.length === 0) readinessMissing.push("至少选择 1 项技能");
  if (selectedSopSteps.length === 0) readinessMissing.push("至少选择 1 个 SOP 步骤");
  const readinessHint =
    readinessScore >= 100
      ? "配置完整，可保存为本地草稿。"
      : readinessMissing.length > 0
        ? `缺少：${readinessMissing.join("、")}。`
        : "继续补充技能或编排步骤可提升就绪度。";

  function toggleSkill(skillId: string): void {
    onConfigChange({
      ...config,
      selectedSkillIds: toggleAgentBuilderId(config.selectedSkillIds, skillId, agentSkillCatalog.map((s) => s.id)),
    });
  }

  function toggleSopStep(stepId: string): void {
    onConfigChange({
      ...config,
      selectedSopStepIds: toggleAgentBuilderId(config.selectedSopStepIds, stepId, agentSopCatalog.map((s) => s.id)),
    });
  }

  return (
    <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="builder">
      <div className="section-head">
        <span className="eyebrow">Agent Builder</span>
        <h2 className="h2">可视化构建你的 Agent</h2>
        <p className="sub">从技能池挑选能力、编排 SOP 步骤，右侧实时预览配置草稿与就绪度。</p>
      </div>

      <div className="bld">
        <div className="pool">
          <div className="pool-h">技能池</div>
          {agentSkillCatalog.map((skill) => {
            const selected = config.selectedSkillIds.includes(skill.id);
            return (
              <div key={skill.id} className={`skill-pick ${selected ? "on" : ""}`} onClick={() => toggleSkill(skill.id)} role="button" aria-pressed={selected}>
                <span className="bx" aria-hidden="true">
                  <Check aria-hidden="true" />
                </span>
                <span className="nm">{skill.name}</span>
              </div>
            );
          })}
        </div>

        <div className="sop">
          {agentSopCatalog.map((step, index) => {
            const selected = config.selectedSopStepIds.includes(step.id);
            return (
              <div key={step.id} className="step" onClick={() => toggleSopStep(step.id)} role="button" aria-pressed={selected}>
                <span className="step-n">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <div className="step-mn">{step.title}</div>
                  <div className="step-ds">{step.summary}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <div className="preview">
            <div className="preview-bar">
              <span className="tt">agent.config.ts</span>
              <span className="pill green" style={{ marginLeft: "auto" }}>
                <span className="d" /> 本地
              </span>
            </div>
            <pre>
              <span className="c">{"// 实时预览草稿"}</span>
              {"\n"}
              <span className="k">export const</span> agent = {"{"}
              {"\n  "}
              <span className="p">name</span>: <span className="s">"{config.name || "未命名 Agent"}"</span>,
              {"\n  "}
              <span className="p">skills</span>: [
              {selectedSkills.map((skill) => (
                <span key={skill.id}>
                  {"\n    "}
                  <span className="s">"{skill.name}"</span>,
                </span>
              ))}
              {"\n  "}],
              {"\n  "}
              <span className="p">sop</span>: [
              {selectedSopSteps.map((step) => (
                <span key={step.id}>
                  {"\n    "}
                  <span className="s">"{step.title}"</span>,
                </span>
              ))}
              {"\n  "}],
              {"\n  "}
              <span className="p">local</span>: <span className="k">true</span>
              {"\n"}
              {"}"};
            </pre>
          </div>

          <div className="ready">
            <div className="ready-top">
              <span>就绪度</span>
              <b>{readinessScore}%</b>
            </div>
            <div className="bar">
              <i style={{ width: `${readinessScore}%` }} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.6 }}>
              {readinessHint}
            </div>
            <button type="button" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={onSaveDraft}>
              <Plus aria-hidden="true" /> 保存草稿
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
