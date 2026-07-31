/** 最多保留 100 步的事务历史。 */
export type EditorHistory<T> = { past: T[]; future: T[] };

const cloneSnapshot = <T>(snapshot: T): T => structuredClone(snapshot);

/** 将当前快照压入撤销栈。 */
export function pushHistory<T>(history: EditorHistory<T>, snapshot: T, limit = 100): EditorHistory<T> {
  return { past: [...history.past, cloneSnapshot(snapshot)].slice(-limit), future: [] };
}

/** 撤销一个完整事务。 */
export function undoHistory<T>(history: EditorHistory<T>, current: T) {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return { snapshot: cloneSnapshot(previous), history: { past: history.past.slice(0, -1), future: [cloneSnapshot(current), ...history.future] } };
}

/** 重做一个完整事务。 */
export function redoHistory<T>(history: EditorHistory<T>, current: T) {
  const next = history.future[0];
  if (!next) return null;
  return { snapshot: cloneSnapshot(next), history: { past: [...history.past, cloneSnapshot(current)].slice(-100), future: history.future.slice(1) } };
}
