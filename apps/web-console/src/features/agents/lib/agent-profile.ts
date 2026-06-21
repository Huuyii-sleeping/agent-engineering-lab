import { agentSkillCatalog } from "../../../agent-builder";
import type { AgentProfile, AgentProfileInput } from "../../../api";

export function agentDraftFromProfile(agent: AgentProfile): AgentProfileInput {
  return {
    avatarId: agent.avatarId,
    name: agent.name,
    description: agent.description,
    scenario: agent.scenario,
    skillIds: agent.skillIds,
    actions: agent.actions,
    systemPrompt: agent.systemPrompt,
  };
}

export function agentSkillName(skillId: string): string {
  return agentSkillCatalog.find((skill) => skill.id === skillId)?.name ?? skillId;
}
