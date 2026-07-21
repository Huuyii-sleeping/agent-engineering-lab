import { describe, expect, it } from "vitest";
import { WorkflowVariableContext, assertWorkflowValueType } from "../../../src/workflows/context.js";

describe("WorkflowVariableContext", () => {
  it("解析 workflow、node、system、environment 和 secret 作用域", async () => {
    const context = new WorkflowVariableContext({
      inputs: { question: { nested: "hello" } },
      system: { runId: "run-1" },
      environment: { ORBIT_ENV: "test" },
      secretProvider: { read: async (credentialId, key) => `${credentialId}:${key ?? ""}` },
    });
    context.setNodeOutput("node-1", { result: { score: 9 } });

    await expect(context.resolve({ scope: "workflow-input", inputId: "question", path: ["nested"] })).resolves.toBe("hello");
    await expect(context.resolve({ scope: "node-output", nodeId: "node-1", portId: "result", path: ["score"] })).resolves.toBe(9);
    await expect(context.resolve({ scope: "system", key: "runId" })).resolves.toBe("run-1");
    await expect(context.resolve({ scope: "environment", key: "ORBIT_ENV" })).resolves.toBe("test");
    await expect(context.resolve({ scope: "secret", credentialId: "cred", key: "token" })).resolves.toBe("cred:token");
  });

  it("递归解析 ValueOrVariable 并检查输出类型", async () => {
    const context = new WorkflowVariableContext({ inputs: { value: 7 } });
    await expect(context.resolveValue({ nested: [{ kind: "variable", ref: { scope: "workflow-input", inputId: "value" } }] })).resolves.toEqual({ nested: [7] });
    expect(() => assertWorkflowValueType("count", "integer", 1)).not.toThrow();
    expect(() => assertWorkflowValueType("count", "integer", 1.5)).toThrow(/integer/);
  });
});
