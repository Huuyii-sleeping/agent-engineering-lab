import type { AgentProfile, AgentProfileInput, AgentSkillPreflightResult, SkillRegistryItem } from "../../../api";
import { AgentConfigPage } from "./AgentConfigPage";
import { AgentDraftsPage } from "./AgentDraftsPage";

export function AgentManagerPage({
  agents,
  activeAgent,
  draft,
  error,
  isNewDraft,
  loading,
  saving,
  installedSkills,
  mode,
  onBackToDrafts,
  onCreateAgent,
  onDeleteAgent,
  onDiscardDraft,
  onDraftChange,
  onOpenAgent,
  onRefresh,
  onResolveAgentSkills,
  onSaveAgent,
  onTestAgent,
  skillPreflight,
  skillPreflightLoading,
}: {
  agents: AgentProfile[];
  activeAgent: AgentProfile | null;
  draft: AgentProfileInput;
  error: string | null;
  isNewDraft: boolean;
  loading: boolean;
  saving: boolean;
  installedSkills: SkillRegistryItem[];
  mode: "drafts" | "config";
  onBackToDrafts: () => void;
  onCreateAgent: () => void;
  onDeleteAgent: (agent: AgentProfile) => void;
  onDiscardDraft: () => void;
  onDraftChange: (draft: AgentProfileInput) => void;
  onOpenAgent: (agent: AgentProfile) => void;
  onRefresh: () => void;
  onResolveAgentSkills: () => void;
  onSaveAgent: () => void;
  onTestAgent: (agent: AgentProfile) => void;
  skillPreflight: AgentSkillPreflightResult | null;
  skillPreflightLoading: boolean;
}) {
  if (mode === "config") {
    return (
      <AgentConfigPage
        activeAgent={activeAgent}
        draft={draft}
        error={error}
        isNewDraft={isNewDraft}
        saving={saving}
        installedSkills={installedSkills}
        onBack={onBackToDrafts}
        onDeleteAgent={onDeleteAgent}
        onDiscardDraft={onDiscardDraft}
        onDraftChange={onDraftChange}
        onResolveAgentSkills={onResolveAgentSkills}
        onSaveAgent={onSaveAgent}
        onTestAgent={onTestAgent}
        skillPreflight={skillPreflight}
        skillPreflightLoading={skillPreflightLoading}
      />
    );
  }

  return (
    <AgentDraftsPage
      agents={agents}
      error={error}
      loading={loading}
      saving={saving}
      onCreateAgent={onCreateAgent}
      onOpenAgent={onOpenAgent}
      onRefresh={onRefresh}
    />
  );
}
