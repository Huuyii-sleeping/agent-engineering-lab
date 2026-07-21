import { describe, expect, it, vi } from "vitest";
import { LlmWorkflowExecutor } from "../../../../src/workflows/executors/llm.js";
import { WorkflowVariableContext } from "../../../../src/workflows/context.js";

describe("LlmWorkflowExecutor", () => {
  it("复用模型服务并转发流式 delta", async () => {
    const complete = vi.fn(async (input: { onDelta(delta: string): void }) => {
      input.onDelta("hel");
      input.onDelta("lo");
      return { text: "hello", usage: { promptTokens: 2, completionTokens: 1 } };
    });
    const deltas: string[] = [];
    const executor = new LlmWorkflowExecutor({ complete });
    const node = { id: "llm", type: "llm", nodeVersion: 1, label: "LLM", disabled: false, config: { model: "gpt-test", prompt: { kind: "literal", value: "hi" } }, ports: { inputs: [], outputs: [] }, executor: executor.identity, execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: false, onError: "fail" } } as const;
    const result = await executor.execute({ runId: "run", node, inputs: {}, variables: new WorkflowVariableContext({ inputs: {} }), signal: new AbortController().signal, emitLog: () => {}, emitDelta: (delta) => deltas.push(delta) });
    expect(result.outputs).toEqual({ text: "hello", usage: { promptTokens: 2, completionTokens: 1 } });
    expect(deltas).toEqual(["hel", "lo"]);
  });
});
