import type {
  AvailableVariable,
  BuiltinWorkflowNode,
  WorkflowDraft,
  WorkflowEdge,
  WorkflowNode,
  WorkflowSubgraph,
} from "@orbit/workflow-core";
import { getAvailableSubgraphVariables } from "@orbit/workflow-core";

/** Iteration 与 Loop 共用的可编辑容器节点。 */
export type SopEditableContainerNode = BuiltinWorkflowNode<"iteration"> | BuiltinWorkflowNode<"loop">;

/** 从顶层 Workflow 到当前容器的稳定 node id 路径。 */
export type SopContainerPath = readonly string[];

/** 框架无关的 Workflow 图切片。 */
export type SopWorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

/** 面包屑中的一个可导航 Workflow 作用域。 */
export type SopScopeCrumb = {
  nodeId: string | null;
  label: string;
  subgraphId: string | null;
  path: string[];
};

/** 判断节点是否拥有统一 WorkflowSubgraph 编辑能力。 */
export function isSopEditableContainer(node: WorkflowNode): node is SopEditableContainerNode {
  return node.kind === "builtin" && (node.type === "iteration" || node.type === "loop");
}

/** 生成不会受展示标签变化影响的作用域 key。 */
export function getSopScopeKey(path: SopContainerPath): string {
  return path.length === 0 ? "root" : `root/${path.map(encodeURIComponent).join("/")}`;
}

function findContainer(graph: SopWorkflowGraph, nodeId: string, path: SopContainerPath): SopEditableContainerNode {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) throw new RangeError(`容器路径无效：作用域 ${getSopScopeKey(path)} 中不存在节点 ${nodeId}。`);
  if (!isSopEditableContainer(node)) throw new TypeError(`节点 ${nodeId} 不是可编辑的 Iteration/Loop 容器。`);
  return node;
}

/** 读取指定容器路径对应的持久化 Workflow 图。 */
export function getSopGraphAtPath(draft: WorkflowDraft, path: SopContainerPath): SopWorkflowGraph {
  let graph: SopWorkflowGraph = { nodes: draft.nodes, edges: draft.edges };
  const visited: string[] = [];
  for (const nodeId of path) {
    const container = findContainer(graph, nodeId, visited);
    graph = container.config.body;
    visited.push(nodeId);
  }
  return graph;
}

/** 读取路径末端容器；顶层作用域返回 null。 */
export function getSopContainerAtPath(draft: WorkflowDraft, path: SopContainerPath): SopEditableContainerNode | null {
  if (path.length === 0) return null;
  let graph: SopWorkflowGraph = { nodes: draft.nodes, edges: draft.edges };
  const visited: string[] = [];
  let active: SopEditableContainerNode | null = null;
  for (const nodeId of path) {
    active = findContainer(graph, nodeId, visited);
    graph = active.config.body;
    visited.push(nodeId);
  }
  return active;
}

/** 返回容器内部目标节点可见的 item/index/iteration/loop variables 与内部上游输出。 */
export function getSopSubgraphVariablesAtPath(draft: WorkflowDraft, path: SopContainerPath, targetNodeId: string): AvailableVariable[] {
  const container = getSopContainerAtPath(draft, path);
  return container ? getAvailableSubgraphVariables(container, targetNodeId) : [];
}

function replaceNestedGraph(
  graph: SopWorkflowGraph,
  path: SopContainerPath,
  replacement: SopWorkflowGraph,
  visited: SopContainerPath,
): SopWorkflowGraph {
  const [nodeId, ...rest] = path;
  if (!nodeId) return replacement;
  const container = findContainer(graph, nodeId, visited);
  const nextBody = replaceNestedGraph(container.config.body, rest, replacement, [...visited, nodeId]);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => node.id === nodeId
      ? { ...container, config: { ...container.config, body: { ...container.config.body, ...nextBody } } } as WorkflowNode
      : node),
  };
}

/** 只替换目标作用域的 nodes/edges，保留 subgraph id、输入输出及其他节点原文。 */
export function updateSopGraphAtPath(draft: WorkflowDraft, path: SopContainerPath, replacement: SopWorkflowGraph): WorkflowDraft {
  const graph = replaceNestedGraph({ nodes: draft.nodes, edges: draft.edges }, path, replacement, []);
  return { ...draft, nodes: graph.nodes, edges: graph.edges };
}

/** 从当前作用域进入指定 Iteration/Loop 子图。 */
export function enterSopContainer(draft: WorkflowDraft, currentPath: SopContainerPath, nodeId: string): string[] {
  const graph = getSopGraphAtPath(draft, currentPath);
  findContainer(graph, nodeId, currentPath);
  return [...currentPath, nodeId];
}

/** 构建顶层到当前容器的可点击面包屑。 */
export function getSopScopeCrumbs(draft: WorkflowDraft, path: SopContainerPath): SopScopeCrumb[] {
  const crumbs: SopScopeCrumb[] = [{ nodeId: null, label: draft.name, subgraphId: null, path: [] }];
  let graph: SopWorkflowGraph = { nodes: draft.nodes, edges: draft.edges };
  const visited: string[] = [];
  for (const nodeId of path) {
    const container = findContainer(graph, nodeId, visited);
    visited.push(nodeId);
    const body: WorkflowSubgraph = container.config.body;
    crumbs.push({ nodeId, label: container.label, subgraphId: body.id, path: [...visited] });
    graph = body;
  }
  return crumbs;
}
