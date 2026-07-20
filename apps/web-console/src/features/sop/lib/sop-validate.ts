import type { SopDraft } from "./sop-types";

/** DAG 校验结果。 */
export type SopValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * 校验 SOP 草稿是否构成合法的有向无环图（DAG）。
 * 规则：单一开始节点、从开始可达、无悬挂节点、无环、至少含一个结束节点。
 */
export function validateSop(draft: SopDraft): SopValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodes = draft.nodes;
  const edges = draft.edges;

  if (nodes.length === 0) {
    return { ok: false, errors: ["画布为空，请先添加节点。"], warnings };
  }

  const startNodes = nodes.filter((node) => node.type === "start");
  if (startNodes.length === 0) {
    errors.push("缺少「开始」节点，流程无法启动。");
  } else if (startNodes.length > 1) {
    errors.push(`存在 ${startNodes.length} 个「开始」节点，只能有 1 个。`);
  }

  const endNodes = nodes.filter((node) => node.type === "end");
  if (endNodes.length === 0) {
    warnings.push("缺少「结束」节点，流程没有明确的出口。");
  }

  // 邻接表
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) {
      errors.push("存在指向不存在节点的连边。");
      continue;
    }
    adjacency.get(edge.source)!.push(edge.target);
  }

  // 从所有开始节点做可达性 BFS
  const reachable = new Set<string>();
  const queue = startNodes.map((node) => node.id);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!reachable.has(next)) queue.push(next);
    }
  }

  const unreachable = nodes.filter((node) => !reachable.has(node.id));
  if (unreachable.length > 0) {
    const names = unreachable.map((node) => node.label || node.id).join("、");
    errors.push(`存在无法从开始节点到达的节点：${names}。`);
  }

  // 环检测（DFS 三色标记）
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(nodes.map((node) => [node.id, WHITE]));
  let hasCycle = false;
  const visit = (id: string): void => {
    color.set(id, GRAY);
    for (const next of adjacency.get(id) ?? []) {
      const state = color.get(next) ?? WHITE;
      if (state === GRAY) {
        hasCycle = true;
        return;
      }
      if (state === WHITE) {
        visit(next);
        if (hasCycle) return;
      }
    }
    color.set(id, BLACK);
  };
  for (const node of nodes) {
    if (color.get(node.id) === WHITE) {
      visit(node.id);
      if (hasCycle) break;
    }
  }
  if (hasCycle) {
    errors.push("流程存在环（循环依赖），必须是有向无环图。");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
