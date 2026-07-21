import type { AvailableVariable, WorkflowDiagnostic, WorkflowNode } from "@orbit/workflow-core";

/** 节点专属配置面板共享契约。 */
export type NodeConfigInspectorProps = {
  node: WorkflowNode;
  onChange: (node: WorkflowNode) => void;
  availableVariables: AvailableVariable[];
  diagnostics: WorkflowDiagnostic[];
};
