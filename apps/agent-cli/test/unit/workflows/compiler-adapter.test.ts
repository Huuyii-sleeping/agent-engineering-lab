import { describe, expect, it } from "vitest";
import { compileWorkflowForRuntime } from "../../../src/workflows/compiler-adapter.js";

describe("compileWorkflowForRuntime", () => {
  it("将共享编译诊断转换为可读 runtime 错误", () => {
    expect(() => compileWorkflowForRuntime({ schemaVersion: 2, id: "invalid", name: "invalid", nodes: [], edges: [] })).toThrow(/工作流编译失败/);
  });
});
