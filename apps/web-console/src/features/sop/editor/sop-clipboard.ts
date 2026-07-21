import type { Edge, Node } from "@xyflow/react";
import type { SopFlowData, SopFlowEdgeData } from "./sop-flow-adapter";
import { cloneSelectedGraph } from "./sop-selection";

const CLIPBOARD_KIND = "orbit-workflow-selection-v1";

/** 跨工作流粘贴载荷。 */
export type WorkflowClipboardPayload = { kind: typeof CLIPBOARD_KIND; sourceWorkflowId: string; nodes: Node<SopFlowData>[]; edges: Edge<SopFlowEdgeData>[] };

/** 序列化当前选中子图。 */
export function serializeSelection(workflowId: string, nodes: readonly Node<SopFlowData>[], edges: readonly Edge<SopFlowEdgeData>[], selectedNodeIds: ReadonlySet<string>): string {
  const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id));
  const selectedEdges = edges.filter((edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target));
  return JSON.stringify({ kind: CLIPBOARD_KIND, sourceWorkflowId: workflowId, nodes: selectedNodes, edges: selectedEdges } satisfies WorkflowClipboardPayload);
}

/** 解析并重写剪贴板子图 ID。 */
export function pasteSelection(text: string, createId: (prefix: "n" | "e") => string) {
  const payload = JSON.parse(text) as WorkflowClipboardPayload;
  if (payload.kind !== CLIPBOARD_KIND || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) throw new TypeError("剪贴板中没有可识别的工作流节点。 ");
  return cloneSelectedGraph(payload.nodes, payload.edges, new Set(payload.nodes.map((node) => node.id)), createId, { x: 40, y: 40 });
}
