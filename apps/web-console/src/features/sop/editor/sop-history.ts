import type { Edge, Node } from "@xyflow/react";
import type { SopFlowData, SopFlowEdgeData } from "./sop-flow-adapter";

/** 编辑器事务快照。 */
export type EditorSnapshot = { nodes: Node<SopFlowData>[]; edges: Edge<SopFlowEdgeData>[] };
/** 最多保留 100 步的事务历史。 */
export type EditorHistory = { past: EditorSnapshot[]; future: EditorSnapshot[] };

const cloneSnapshot = (snapshot: EditorSnapshot): EditorSnapshot => structuredClone(snapshot);

/** 将当前快照压入撤销栈。 */
export function pushHistory(history: EditorHistory, snapshot: EditorSnapshot, limit = 100): EditorHistory {
  return { past: [...history.past, cloneSnapshot(snapshot)].slice(-limit), future: [] };
}

/** 撤销一个完整事务。 */
export function undoHistory(history: EditorHistory, current: EditorSnapshot) {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return { snapshot: cloneSnapshot(previous), history: { past: history.past.slice(0, -1), future: [cloneSnapshot(current), ...history.future] } };
}

/** 重做一个完整事务。 */
export function redoHistory(history: EditorHistory, current: EditorSnapshot) {
  const next = history.future[0];
  if (!next) return null;
  return { snapshot: cloneSnapshot(next), history: { past: [...history.past, cloneSnapshot(current)].slice(-100), future: history.future.slice(1) } };
}
