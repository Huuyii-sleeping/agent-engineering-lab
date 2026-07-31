import { describe, expect, it, vi } from "vitest";
import { WorkflowVariableContext } from "../../../../src/workflows/context.js";
import { MastraWorkflowAgentExecutor } from "../../../../src/mastra/workflows/agent-executor.js";

describe("mastra/workflows/agent-executor", () => {
  it("将 LLM 节点委托共享 Mastra Agent resolver 并传播 delta 与运行上下文", async () => {
    const stream = vi.fn(async (input: { onDelta(delta: string): void }) => {
      input.onDelta("hel");
      input.onDelta("lo");
      return { text: "hello", usage: { inputTokens: 2, outputTokens: 1 } };
    });
    const executor = new MastraWorkflowAgentExecutor({ stream });
    const deltas: string[] = [];
    const node = {
      id: "llm",
      type: "llm",
      nodeVersion: 1,
      label: "LLM",
      disabled: false,
      config: { model: "gpt-test", prompt: { kind: "literal", value: "hi" } },
      ports: { inputs: [], outputs: [] },
      executor: executor.identity,
      execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: false, onError: "fail" },
    } as const;

    const result = await executor.execute({
      runId: "run-1",
      workflowId: "workflow-1",
      requestContext: { ownerId: "owner-1" },
      node,
      inputs: {},
      variables: new WorkflowVariableContext({ inputs: {} }),
      signal: new AbortController().signal,
      emitLog: () => undefined,
      emitDelta: (delta) => deltas.push(delta),
    });

    expect(result.outputs).toEqual({ text: "hello", usage: { inputTokens: 2, outputTokens: 1 } });
    expect(deltas).toEqual(["hel", "lo"]);
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: "workflow-1",
      runId: "run-1",
      requestContext: { ownerId: "owner-1" },
    }));
  });
});
