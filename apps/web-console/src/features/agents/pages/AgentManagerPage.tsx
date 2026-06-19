import type { AgentProfile, AgentProfileInput } from "../../../api";
import { AgentConfigPage } from "./AgentConfigPage";
import { AgentDraftsPage } from "./AgentDraftsPage";

export function AgentManagerPage({
  agents,
  activeAgent,
  draft,
  isNewDraft,
  loading,
  saving,
  mode,
  onBackToDrafts,
  onCreateAgent,
  onDeleteAgent,
  onDraftChange,
  onOpenAgent,
  onRefresh,
  onSaveAgent,
  onTestAgent,
}: {
  agents: AgentProfile[];
  activeAgent: AgentProfile | null;
  draft: AgentProfileInput;
  isNewDraft: boolean;
  loading: boolean;
  saving: boolean;
  mode: "drafts" | "config";
  onBackToDrafts: () => void;
  onCreateAgent: () => void;
  onDeleteAgent: (agent: AgentProfile) => void;
  onDraftChange: (draft: AgentProfileInput) => void;
  onOpenAgent: (agent: AgentProfile) => void;
  onRefresh: () => void;
  onSaveAgent: () => void;
  onTestAgent: (agent: AgentProfile) => void;
}) {
  if (mode === "config") {
    return (
      <AgentConfigPage
        activeAgent={activeAgent}
        draft={draft}
        isNewDraft={isNewDraft}
        saving={saving}
        onBack={onBackToDrafts}
        onDeleteAgent={onDeleteAgent}
        onDraftChange={onDraftChange}
        onSaveAgent={onSaveAgent}
        onTestAgent={onTestAgent}
      />
    );
  }

  return (
    <AgentDraftsPage
      agents={agents}
      loading={loading}
      saving={saving}
      onCreateAgent={onCreateAgent}
      onOpenAgent={onOpenAgent}
      onRefresh={onRefresh}
    />
  );
}
