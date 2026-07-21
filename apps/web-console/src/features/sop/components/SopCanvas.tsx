import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowDraft } from "@orbit/workflow-core";
import { SopCanvasShell } from "../editor/components/SopCanvasShell";

/** SOP 编排画布薄入口。 */
export function SopCanvas(props: {
  initial: WorkflowDraft;
  legacyBackup: string | null;
  onSave: (draft: WorkflowDraft) => void | Promise<void>;
  onAutoSave?: (draft: WorkflowDraft) => void | Promise<void>;
  onRecoveryChange?: (draft: WorkflowDraft) => void;
  onBack: () => void;
  onOpenLifecycle: () => void;
}) {
  return <ReactFlowProvider><SopCanvasShell {...props} /></ReactFlowProvider>;
}
