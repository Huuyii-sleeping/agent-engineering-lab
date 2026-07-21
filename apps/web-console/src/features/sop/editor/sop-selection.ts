import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNode } from "@orbit/workflow-core";
import type { SopFlowData, SopFlowEdgeData } from "./sop-flow-adapter";

/** 复制选中子图并重写节点、连边 ID。 */
export function cloneSelectedGraph(
  nodes: readonly Node<SopFlowData>[],
  edges: readonly Edge<SopFlowEdgeData>[],
  selectedNodeIds: ReadonlySet<string>,
  createId: (prefix: "n" | "e") => string,
  offset = { x: 30, y: 30 },
) {
  const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id));
  const idMap = new Map(selectedNodes.map((node) => [node.id, createId("n")]));
  const clonedNodes = selectedNodes.map((item) => {
    const id = idMap.get(item.id)!;
    const position = { x: item.position.x + offset.x, y: item.position.y + offset.y };
    const node = { ...item.data.node, id, label: `${item.data.node.label}（副本）`, position } as WorkflowNode;
    return { ...item, id, selected: true, position, data: { ...item.data, node } };
  });
  const clonedEdges = edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({ ...edge, id: createId("e"), source: idMap.get(edge.source)!, target: idMap.get(edge.target)!, selected: false }));
  return { nodes: clonedNodes, edges: clonedEdges, idMap };
}
