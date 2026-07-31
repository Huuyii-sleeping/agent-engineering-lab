import { describe, expect, it } from "vitest";
import { pushHistory, redoHistory, undoHistory, type EditorHistory } from "./sop-history";

describe("editor history", () => {
  it("按事务撤销和重做完整节点边快照", () => {
    let history: EditorHistory<{ nodes: { id: string }[]; edges: { id: string }[] }> = { past: [], future: [] };
    const empty = { nodes: [], edges: [] };
    history = pushHistory(history, empty);
    const current = { nodes: [{ id: "a" }], edges: [{ id: "e" }] };
    const undone = undoHistory(history, current)!;
    expect(undone.snapshot).toEqual(empty);
    expect(redoHistory(undone.history, empty)?.snapshot).toEqual(current);
  });

  it("最多保留 100 个事务", () => {
    let history: EditorHistory<{ nodes: { id: string }[]; edges: never[] }> = { past: [], future: [] };
    for (let index = 0; index < 120; index += 1) history = pushHistory(history, { nodes: [{ id: String(index) }], edges: [] });
    expect(history.past).toHaveLength(100);
  });

  it("将容器路径与分作用域选择作为同一事务深拷贝", () => {
    type Snapshot = { scopePath: string[]; selections: Record<string, { nodeIds: string[] }> };
    const before: Snapshot = { scopePath: [], selections: { root: { nodeIds: ["iteration"] } } };
    const history = pushHistory<Snapshot>({ past: [], future: [] }, before);
    before.selections.root.nodeIds.length = 0;
    const current: Snapshot = { scopePath: ["iteration"], selections: { "root/iteration": { nodeIds: ["child"] } } };
    const undone = undoHistory(history, current)!;
    expect(undone.snapshot).toEqual({ scopePath: [], selections: { root: { nodeIds: ["iteration"] } } });
    expect(redoHistory(undone.history, undone.snapshot)?.snapshot).toEqual(current);
  });
});
