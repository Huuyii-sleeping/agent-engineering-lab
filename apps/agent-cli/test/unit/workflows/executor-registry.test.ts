import { describe, expect, it } from "vitest";
import { WorkflowExecutorRegistry } from "../../../src/workflows/executor-registry.js";

describe("WorkflowExecutorRegistry", () => {
  it("按稳定 identity 注册和读取执行器并拒绝重复", () => {
    const registry = new WorkflowExecutorRegistry();
    const executor = { identity: { id: "workflow.test", version: 1 }, execute: async () => ({ outputs: {} }) };
    registry.register(executor);
    expect(registry.get(executor.identity)).toBe(executor);
    expect(() => registry.register(executor)).toThrow(/重复/);
    expect(() => registry.require({ id: "missing", version: 1 })).toThrow(/missing@1/);
  });
});
