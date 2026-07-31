import type { AgentVersion, AvailableVariable, WorkflowDiagnostic, WorkflowNode } from "@orbit/workflow-core";

/** Subworkflow inspector 使用的不可变发布版本视图。 */
export type WorkflowVersionReferenceOption = {
  workflowId: string;
  workflowName: string;
  versionId: string;
  version: number;
  contentHash: string;
};

/** Workflow 引用目录由编辑器 shell 统一加载，inspector 只消费视图状态。 */
export type WorkflowReferenceCatalog = {
  state: "idle" | "loading" | "ready" | "error";
  options: WorkflowVersionReferenceOption[];
  message: string;
  refresh: () => void;
};

/** Agent inspector 使用的不可变发布版本目录。 */
export type AgentVersionReferenceCatalog = {
  state: "idle" | "loading" | "ready" | "error";
  options: AgentVersion[];
  message: string;
  refresh: () => void;
};

/** 节点专属配置面板共享契约。 */
export type NodeConfigInspectorProps = {
  node: WorkflowNode;
  onChange: (node: WorkflowNode) => void;
  scopeNodes: WorkflowNode[];
  currentWorkflowId: string;
  scopeDepth: number;
  workflowReferences: WorkflowReferenceCatalog;
  agentReferences: AgentVersionReferenceCatalog;
  availableVariables: AvailableVariable[];
  diagnostics: WorkflowDiagnostic[];
};
