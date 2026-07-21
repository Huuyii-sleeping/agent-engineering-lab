import { describe, expect, it, vi } from "vitest";
import { ToolWorkflowExecutor } from "../../../../src/workflows/executors/tool.js";
import { WorkflowVariableContext } from "../../../../src/workflows/context.js";

describe("ToolWorkflowExecutor", () => {
  it("通过现有 ToolService 权限执行链调用工具", async () => {
    const runToolByName = vi.fn(async () => JSON.stringify({ ok: true, value: 7 }));
    const executor = new ToolWorkflowExecutor({ runToolByName } as never);
    const node = { id: "tool", type: "tool", nodeVersion: 1, label: "工具", disabled: false, config: { toolId: "quality", arguments: { value: { kind: "literal", value: 7 } } }, ports: { inputs: [], outputs: [] }, executor: executor.identity, execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: false, onError: "fail" } } as const;
    const result = await executor.execute({ runId: "run", node, inputs: {}, variables: new WorkflowVariableContext({ inputs: {} }), signal: new AbortController().signal, emitLog: () => {}, emitDelta: () => {} });
    expect(runToolByName).toHaveBeenCalledWith("quality", JSON.stringify({ value: 7 }));
    expect(result.outputs).toEqual({ result: { ok: true, value: 7 } });
  });
});
