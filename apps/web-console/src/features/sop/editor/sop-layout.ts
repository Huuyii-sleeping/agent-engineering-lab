import type { Edge, Node } from "@xyflow/react";
import type { SopFlowData, SopFlowEdgeData } from "./sop-flow-adapter";

/** 使用 Dagre 对全图或选中子图进行自动布局，并保留固定节点。 */
export async function layoutFlowGraph(nodes: readonly Node<SopFlowData>[], edges: readonly Edge<SopFlowEdgeData>[], direction: "LR" | "TB", selectedNodeIds?: ReadonlySet<string>): Promise<Node<SopFlowData>[]> {
  const { default: dagre } = await import("@dagrejs/dagre");
  const targetIds = selectedNodeIds && selectedNodeIds.size > 0 ? selectedNodeIds : new Set(nodes.map((node) => node.id));
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, ranksep: 90, nodesep: 55, marginx: 20, marginy: 20 });
  for (const node of nodes) if (targetIds.has(node.id) && node.draggable !== false) graph.setNode(node.id, { width: node.measured?.width ?? 168, height: node.measured?.height ?? 90 });
  for (const edge of edges) if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);
  return nodes.map((node) => {
    if (!graph.hasNode(node.id)) return node;
    const point = graph.node(node.id);
    const width = node.measured?.width ?? 168;
    const height = node.measured?.height ?? 90;
    return { ...node, position: { x: point.x - width / 2, y: point.y - height / 2 } };
  });
}
