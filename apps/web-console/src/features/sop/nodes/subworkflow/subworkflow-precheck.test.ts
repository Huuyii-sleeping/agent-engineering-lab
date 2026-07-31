import { describe, expect, it } from "vitest";
import { precheckSubworkflowReference } from "./subworkflow-precheck";

const option = { workflowId: "child", workflowName: "子流程", versionId: "v1", version: 1, contentHash: "hash-1" };

describe("subworkflow-precheck", () => {
  it("接受固定版本并拒绝直接递归、深度和 hash 漂移", () => {
    const config = { workflowId: "child", versionId: "v1", contentHash: "hash-1", inputBindings: [], outputBindings: [] };
    expect(precheckSubworkflowReference(config, { currentWorkflowId: "parent", scopeDepth: 0, options: [option] })).toEqual([]);
    expect(precheckSubworkflowReference({ ...config, workflowId: "parent" }, { currentWorkflowId: "parent", scopeDepth: 5, options: [option] }).map((issue) => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining("直接引用"),
      expect.stringContaining("最大嵌套深度"),
      expect.stringContaining("不存在"),
    ]));
    expect(precheckSubworkflowReference({ ...config, contentHash: "stale" }, { currentWorkflowId: "parent", scopeDepth: 0, options: [option] })[0].message).toContain("contentHash");
  });
});
