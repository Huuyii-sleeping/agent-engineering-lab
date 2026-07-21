import { describe, expect, it } from "vitest";
import { CodeWorkflowExecutor, DefaultWorkflowCodeRunner } from "../../../../src/workflows/executors/code.js";
import { WorkflowVariableContext } from "../../../../src/workflows/context.js";

describe("CodeWorkflowExecutor", () => {
  it("在受限 JavaScript VM 中执行代码并读取输入", async () => {
    const executor = new CodeWorkflowExecutor(new DefaultWorkflowCodeRunner());
    const node = { id: "code", type: "code", nodeVersion: 1, label: "代码", disabled: false, config: { language: "javascript", source: "return input.a + input.b;", inputs: { a: { kind: "literal", value: 2 }, b: { kind: "literal", value: 3 } } }, ports: { inputs: [], outputs: [] }, executor: executor.identity, execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" } } as const;
    const result = await executor.execute({ runId: "run", node, inputs: {}, variables: new WorkflowVariableContext({ inputs: {} }), signal: new AbortController().signal, emitLog: () => {}, emitDelta: () => {} });
    expect(result.outputs).toEqual({ result: 5 });
  });

  it("隔离 process 和 require", async () => {
    const runner = new DefaultWorkflowCodeRunner();
    await expect(runner.run({ language: "javascript", source: "return typeof process + ':' + typeof require;", inputs: {}, timeoutMs: 1_000, signal: new AbortController().signal })).resolves.toBe("undefined:undefined");
  });
});
