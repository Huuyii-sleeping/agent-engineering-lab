import { describe, expect, it, vi } from "vitest";
import { WorkflowVariableContext } from "../../../../src/workflows/context.js";
import { MastraWorkflowToolExecutor } from "../../../../src/mastra/workflows/tool-executor.js";

describe("mastra/workflows/tool-executor", () => {
  it("通过 Mastra Tool Adapter 执行并保持 Workflow executor identity", async () => {
    const executeForWorkflow = vi.fn().mockResolvedValue({ normalized: true });
    const executor = new MastraWorkflowToolExecutor({ executeForWorkflow } as never);
    const signal = new AbortController().signal;
    const node = {
      id: "tool",
      type: "tool",
      nodeVersion: 1,
      label: "工具",
      disabled: false,
      config: { toolId: "normalize", arguments: { value: { kind: "literal", value: 7 } } },
      ports: { inputs: [], outputs: [] },
      executor: executor.identity,
      execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: false, onError: "fail" },
    } as const;

    const result = await executor.execute({
      runId: "run-1",
      workflowId: "workflow-1",
      requestContext: { ownerId: "owner-1", traceId: "trace-1" },
      node,
      inputs: {},
      variables: new WorkflowVariableContext({ inputs: {} }),
      signal,
      emitLog: () => undefined,
      emitDelta: () => undefined,
    });

    expect(result.outputs).toEqual({ result: { normalized: true } });
    expect(executeForWorkflow).toHaveBeenCalledWith({
      toolId: "normalize",
      toolInput: { value: 7 },
      ownerId: "owner-1",
      workflowId: "workflow-1",
      runId: "run-1",
      nodeId: "tool",
      requestContext: { ownerId: "owner-1", traceId: "trace-1" },
      abortSignal: signal,
    });
  });

  it("缺少 ownerId 时在调用 ToolExecutionPort 前明确失败", async () => {
    const executeForWorkflow = vi.fn();
    const executor = new MastraWorkflowToolExecutor({ executeForWorkflow } as never);
    const node = {
      id: "tool",
      type: "tool",
      nodeVersion: 1,
      label: "工具",
      disabled: false,
      config: { toolId: "normalize", arguments: {} },
      ports: { inputs: [], outputs: [] },
      executor: executor.identity,
      execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: false, onError: "fail" },
    } as const;

    await expect(executor.execute({
      runId: "run-1",
      workflowId: "workflow-1",
      node,
      inputs: {},
      variables: new WorkflowVariableContext({ inputs: {} }),
      signal: new AbortController().signal,
      emitLog: () => undefined,
      emitDelta: () => undefined,
    })).rejects.toThrow("ownerId");
    expect(executeForWorkflow).not.toHaveBeenCalled();
  });
});
