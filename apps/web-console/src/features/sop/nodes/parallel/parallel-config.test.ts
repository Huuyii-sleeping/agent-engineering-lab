import { describe, expect, it } from "vitest";
import { builtinNodeRegistry } from "@orbit/workflow-core";
import { appendParallelBranch, listParallelBranchIds, removeParallelBranch, renameParallelBranch } from "./parallel-config";

describe("parallel-config", () => {
  it("改名只刷新端口标签，不改变稳定分支 id", () => {
    const initial = builtinNodeRegistry.get("parallel")!.createDefaultConfig();
    const renamed = renameParallelBranch(initial, "branch-1", "快速路径");
    expect(listParallelBranchIds(renamed.branches)).toEqual(["branch-1", "branch-2"]);
    expect(builtinNodeRegistry.get("parallel")!.createPorts(renamed).outputs).toMatchObject([
      { id: "branch-1", name: "快速路径" },
      { id: "branch-2", name: "分支 2" },
    ]);
  });

  it("新增分支使用新 identity，删除时至少保留两个分支", () => {
    const initial = builtinNodeRegistry.get("parallel")!.createDefaultConfig();
    const appended = appendParallelBranch(initial, () => "branch-stable-3");
    expect(listParallelBranchIds(appended.branches)).toEqual(["branch-1", "branch-2", "branch-stable-3"]);
    const reduced = removeParallelBranch(appended, "branch-1");
    expect(listParallelBranchIds(reduced.branches)).toEqual(["branch-2", "branch-stable-3"]);
    expect(removeParallelBranch(reduced, "branch-2")).toBe(reduced);
  });
});
