import type { Edge, Node } from "@xyflow/react";
import {
  WORKFLOW_SCHEMA_VERSION,
  type WorkflowNodeRunStatus,
  type WorkflowDraft,
  type WorkflowEdge,
  type WorkflowNode,
} from "@orbit/workflow-core";

/** React Flow 节点承载的数据，仅保存 core 节点快照和展示诊断。 */
export type SopFlowData = Record<string, unknown> & {
  node: WorkflowNode;
  issueCount?: number;
  collapsed?: boolean;
  runStatus?: WorkflowNodeRunStatus;
  runAttempt?: number;
};

/** React Flow 边承载的修复状态。 */
export type SopFlowEdgeData = Record<string, unknown> & {
  status: "valid" | "needs-repair";
  issue?: string;
  runtimeActive?: boolean;
  runtimeTraversed?: boolean;
  runtimeExcluded?: boolean;
};

/** 将持久化节点映射为 React Flow 展示节点。 */
export function toFlowNodes(draft: WorkflowDraft): Node<SopFlowData>[] {
  return toFlowGraphNodes(draft.nodes);
}

/** 将持久化连边映射为 React Flow 展示边。 */
export function toFlowEdges(draft: WorkflowDraft): Edge<SopFlowEdgeData>[] {
  return toFlowGraphEdges(draft.edges);
}

/** 将任意 Workflow 图节点映射为 React Flow 展示节点。 */
export function toFlowGraphNodes(nodes: readonly WorkflowNode[]): Node<SopFlowData>[] {
  return nodes.map((node) => ({ id: node.id, type: "sop", position: node.position, data: { node } }));
}

/** 将任意 Workflow 图连边映射为 React Flow 展示边。 */
export function toFlowGraphEdges(edges: readonly WorkflowEdge[]): Edge<SopFlowEdgeData>[] {
  return edges.map((edge) => ({
    id: edge.id,
    type: "sop",
    source: edge.source.nodeId,
    target: edge.target.nodeId,
    sourceHandle: edge.source.portId,
    targetHandle: edge.target.portId,
    label: edge.label,
    data: { status: edge.status ?? "valid", issue: edge.issue },
  }));
}

/** 将 React Flow 展示状态还原为框架无关 Workflow 图。 */
export function toWorkflowGraph(nodes: Node<SopFlowData>[], edges: Edge<SopFlowEdgeData>[]) {
  return {
    nodes: nodes.map(({ position, data }) => ({ ...data.node, position })),
    edges: edges.map((edge): WorkflowEdge => ({
      id: edge.id,
      source: { nodeId: edge.source, portId: edge.sourceHandle ?? "out" },
      target: { nodeId: edge.target, portId: edge.targetHandle ?? "in" },
      label: typeof edge.label === "string" && edge.label.trim() ? edge.label : undefined,
      status: edge.data?.status ?? "valid",
      issue: edge.data?.issue,
    })),
  };
}

/** 从 React Flow 状态构建可持久化 workflow v2 草稿。 */
export function buildWorkflowDraft(base: WorkflowDraft, name: string, summary: string, nodes: Node<SopFlowData>[], edges: Edge<SopFlowEdgeData>[]): WorkflowDraft {
  const graph = toWorkflowGraph(nodes, edges);
  return {
    ...base,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    name: name.trim() || "未命名流程",
    summary: summary.trim(),
    revision: base.revision + 1,
    updatedAt: Date.now(),
    nodes: graph.nodes,
    edges: graph.edges,
  };
}

/** 从 JSON 导入 v2 草稿，拒绝 UI 内部 React Flow JSON。 */
export function parseWorkflowDraftJson(text: string): WorkflowDraft {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || (parsed as { schemaVersion?: unknown }).schemaVersion !== WORKFLOW_SCHEMA_VERSION) {
    throw new TypeError("仅支持带 schemaVersion: 2 的工作流 JSON；v1 请通过旧草稿迁移入口导入。 ");
  }
  const draft = parsed as WorkflowDraft;
  if (!Array.isArray(draft.nodes) || !Array.isArray(draft.edges) || typeof draft.name !== "string") {
    throw new TypeError("JSON 结构无效：需要 name / nodes / edges 字段。 ");
  }
  return draft;
}
