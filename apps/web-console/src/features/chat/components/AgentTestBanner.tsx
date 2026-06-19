import { ArrowLeft } from "lucide-react";
import type { AgentProfile } from "../../../api";
import { agentSkillName } from "../../agents/lib/agent-profile";

export function AgentTestBanner({ agent, onBack }: { agent: AgentProfile | null; onBack: () => void }) {
  if (!agent) {
    return null;
  }
  return (
    <section className="agent-test-banner" aria-label="当前测试 Agent">
      <div className="agent-test-copy">
        <span>当前测试 Agent</span>
        <strong>{agent.name}</strong>
        <small>{agent.scenario}</small>
      </div>
      <div className="agent-test-meta">
        <span>{agent.skillIds.length} skills</span>
        <span>{agent.actions.length} actions</span>
        <span>{agent.skillIds.slice(0, 2).map(agentSkillName).join(" / ") || "未选择 skill"}</span>
      </div>
      <button className="agent-secondary-action" type="button" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
        <span>返回管理</span>
      </button>
    </section>
  );
}
