import type { AgentProfile, AgentProfileInput } from "../../../api";
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
  mode,
  onBackToDrafts,
  onCreateAgent,
  onDeleteAgent,
  onDiscardDraft,
  onDraftChange,
  onOpenAgent,
  onRefresh,
  onSaveAgent,
  onTestAgent,
}: {
  agents: AgentProfile[];
  activeAgent: AgentProfile | null;
  draft: AgentProfileInput;
  error: string | null;
  isNewDraft: boolean;
  loading: boolean;
  saving: boolean;
  mode: "drafts" | "config";
  onBackToDrafts: () => void;
  onCreateAgent: () => void;
  onDeleteAgent: (agent: AgentProfile) => void;
  onDiscardDraft: () => void;
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
        error={error}
        isNewDraft={isNewDraft}
        saving={saving}
        onBack={onBackToDrafts}
        onDeleteAgent={onDeleteAgent}
        onDiscardDraft={onDiscardDraft}
        onDraftChange={onDraftChange}
        onSaveAgent={onSaveAgent}
        onTestAgent={onTestAgent}
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
