import type { WorkflowNode } from "./nodes.js";
import { WORKFLOW_SCHEMA_VERSION } from "./primitives.js";

/** 工作流连边的端点。 */
export type WorkflowEdgeEndpoint = { nodeId: string; portId: string };

/** 工作流连边；端口失效时保留并标记为 needs-repair。 */
export type WorkflowEdge = {
  id: string;
  source: WorkflowEdgeEndpoint;
  target: WorkflowEdgeEndpoint;
  label?: string;
  status?: "valid" | "needs-repair";
  issue?: string;
};

/** 工作流草稿。 */
export type WorkflowDraft = {
  schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  id: string;
  name: string;
  summary: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown>;
};

/** 发布后的不可变工作流版本。 */
export type WorkflowVersion = {
  schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  id: string;
  workflowId: string;
  version: number;
  contentHash: string;
  createdAt: number;
  createdBy: string;
  releaseNotes?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown>;
};

/** 判断输入是否已经是 workflow v2 草稿。 */
export function isWorkflowDraft(value: unknown): value is WorkflowDraft {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKFLOW_SCHEMA_VERSION &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    Array.isArray(record.nodes) &&
    Array.isArray(record.edges)
  );
}

/** 判断输入是否为不可变 workflow v2 发布版本。 */
export function isWorkflowVersion(value: unknown): value is WorkflowVersion {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKFLOW_SCHEMA_VERSION &&
    typeof record.id === "string" &&
    typeof record.workflowId === "string" &&
    typeof record.version === "number" &&
    typeof record.contentHash === "string" &&
    Array.isArray(record.nodes) &&
    Array.isArray(record.edges)
  );
}
