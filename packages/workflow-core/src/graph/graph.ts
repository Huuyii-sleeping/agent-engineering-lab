import type { WorkflowEdge } from "../contracts/workflow.js";

/** 图算法接受的最小节点结构。 */
export type GraphNode = { id: string };

/** 为工作流图创建邻接表。 */
export function buildAdjacency(nodes: readonly GraphNode[], edges: readonly WorkflowEdge[]) {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.source.nodeId)?.push(edge.target.nodeId);
  return adjacency;
}

/** 返回从指定节点集合可达的节点 id。 */
export function findReachableNodeIds(nodes: readonly GraphNode[], edges: readonly WorkflowEdge[], startNodeIds: readonly string[]): Set<string> {
  const adjacency = buildAdjacency(nodes, edges);
  const reachable = new Set<string>();
  const queue = [...startNodeIds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    for (const next of adjacency.get(current) ?? []) if (!reachable.has(next)) queue.push(next);
  }
  return reachable;
}

/** 返回目标节点的全部拓扑上游节点 id。 */
export function findAncestorNodeIds(nodes: readonly GraphNode[], edges: readonly WorkflowEdge[], nodeId: string): Set<string> {
  const reverseEdges = edges.map((edge) => ({ ...edge, source: edge.target, target: edge.source }));
  const ancestors = findReachableNodeIds(nodes, reverseEdges, [nodeId]);
  ancestors.delete(nodeId);
  return ancestors;
}

/** 返回检测到的第一条环路径；无环时返回 null。 */
export function findCycle(nodes: readonly GraphNode[], edges: readonly WorkflowEdge[]): string[] | null {
  const adjacency = buildAdjacency(nodes, edges);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (nodeId: string): string[] | null => {
    visiting.add(nodeId);
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (visiting.has(next)) return [...stack.slice(stack.indexOf(next)), next];
      if (!visited.has(next)) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  };

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      const cycle = visit(node.id);
      if (cycle) return cycle;
    }
  }
  return null;
}

/** 对 DAG 进行稳定拓扑排序；存在环时抛出可读错误。 */
export function topologicalSort(nodes: readonly GraphNode[], edges: readonly WorkflowEdge[]): string[] {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const adjacency = buildAdjacency(nodes, edges);
  for (const edge of edges) {
    if (indegree.has(edge.target.nodeId)) indegree.set(edge.target.nodeId, (indegree.get(edge.target.nodeId) ?? 0) + 1);
  }
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id).sort();
  const ordered: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    ordered.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const nextCount = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextCount);
      if (nextCount === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }
  if (ordered.length !== nodes.length) throw new Error(`工作流不是 DAG：${findCycle(nodes, edges)?.join(" -> ") ?? "存在环"}`);
  return ordered;
}
