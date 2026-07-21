import { describe, expect, it } from "vitest";
import { pushHistory, redoHistory, undoHistory, type EditorHistory } from "./sop-history";

describe("editor history", () => {
  it("按事务撤销和重做完整节点边快照", () => {
    let history: EditorHistory = { past: [], future: [] };
    const empty = { nodes: [], edges: [] };
    history = pushHistory(history, empty);
    const current = { nodes: [{ id: "a" } as never], edges: [{ id: "e" } as never] };
    const undone = undoHistory(history, current)!;
    expect(undone.snapshot).toEqual(empty);
    expect(redoHistory(undone.history, empty)?.snapshot).toEqual(current);
  });

  it("最多保留 100 个事务", () => {
    let history: EditorHistory = { past: [], future: [] };
    for (let index = 0; index < 120; index += 1) history = pushHistory(history, { nodes: [{ id: String(index) } as never], edges: [] });
    expect(history.past).toHaveLength(100);
  });
});
