import { createStep, createWorkflow } from "@mastra/core/workflows";
import { builtinNodeRegistry, type WorkflowIRIterationNode } from "@orbit/workflow-core";
import { describe, expect, it, vi } from "vitest";
import {
  MASTRA_ITERATION_DESCRIPTOR_SCHEMA,
  MASTRA_ITERATION_RESULT_SCHEMA,
  MASTRA_ITERATION_RESULTS_SCHEMA,
  createMastraIterationForeachWorkflow,
  mergeIterationResults,
  prepareIterationDescriptors,
  resolveIterationConcurrency,
} from "../../../../src/mastra/workflows/iteration-steps.js";
import { MASTRA_WORKFLOW_FRAME_SCHEMA, createMastraWorkflowFrame } from "../../../../src/mastra/workflows/frame.js";

function iterationNode(): WorkflowIRIterationNode {
  const definition = builtinNodeRegistry.get("iteration")!;
  const config = definition.createDefaultConfig();
  config.items = { kind: "literal", value: ["a", "b", "c"] };
  config.maxItems = 3;
  config.maxConcurrency = 3;
  return {
    id: "iteration-1",
    type: "iteration",
    nodeVersion: definition.version,
    label: "迭代",
    disabled: false,
    config,
    ports: definition.createPorts(config),
    executor: definition.executor,
    execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" },
    kind: "iteration",
    body: { nodes: [], edges: [], topology: { orderedNodeIds: [], entryNodeIds: [], terminalNodeIds: [], dependencies: {}, dependents: {} } },
  };
}

describe("iteration steps", () => {
  it("prepare 在启动 body 前校验数组上限并派生稳定 item/index identity", async () => {
    const node = iterationNode();
    const frame = createMastraWorkflowFrame({ productRunId: "run-iteration", executionPath: ["root"] });
    const first = await prepareIterationDescriptors(node, frame, 3);
    const second = await prepareIterationDescriptors(node, frame, 3);

    expect(first.map((item) => [item.index, item.item])).toEqual([[0, "a"], [1, "b"], [2, "c"]]);
    expect(first.map((item) => item.instanceId)).toEqual(second.map((item) => item.instanceId));
    expect(first[1]!.frame).toMatchObject({
      containerId: "iteration-1",
      iterationIndex: 1,
      executionPath: ["root", "iteration-1", "1"],
    });

    node.config.items = { kind: "literal", value: [1, 2, 3, 4] };
    await expect(prepareIterationDescriptors(node, frame, 3)).rejects.toMatchObject({ code: "WORKFLOW_ITERATION_LIMIT_EXCEEDED" });
    node.config.items = { kind: "literal", value: "not-array" as never };
    await expect(prepareIterationDescriptors(node, frame, 3)).rejects.toMatchObject({ code: "WORKFLOW_ITERATION_INPUT_INVALID" });
  });

  it("并发 resolver 取节点、IR 与平台上限最小值", () => {
    const node = iterationNode();
    expect(resolveIterationConcurrency(node, 2)).toBe(2);
    expect(resolveIterationConcurrency(node, 20)).toBe(3);
    node.config.maxConcurrency = 20;
    expect(resolveIterationConcurrency(node, 20)).toBe(10);
  });

  it("使用 Mastra 原生 foreach 受限执行统一 body Workflow", async () => {
    const node = iterationNode();
    node.config.maxConcurrency = 3;
    let active = 0;
    let maximum = 0;
    const body = createWorkflow({
      id: "iteration-body-test",
      inputSchema: MASTRA_ITERATION_DESCRIPTOR_SCHEMA,
      outputSchema: MASTRA_ITERATION_RESULT_SCHEMA,
    }).then(createStep({
      id: "iteration-body-step",
      inputSchema: MASTRA_ITERATION_DESCRIPTOR_SCHEMA,
      outputSchema: MASTRA_ITERATION_RESULT_SCHEMA,
      execute: async ({ inputData }) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return {
          index: inputData.index,
          instanceId: inputData.instanceId,
          status: "succeeded" as const,
          output: inputData.item,
          frame: inputData.frame,
        };
      },
    })).commit();
    const workflow = createMastraIterationForeachWorkflow(node, body, { maxParallelism: 2, maxItems: 3 });
    const run = await workflow.createRun({ runId: "native-iteration-bounded" });
    const result = await run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-iteration-bounded" }) });

    expect(result).toMatchObject({ status: "success" });
    expect(maximum).toBe(2);
    if (result.status === "success") {
      expect(result.result.map((item) => [item.index, item.output])).toEqual([[0, "a"], [1, "b"], [2, "c"]]);
      expect(new Set(result.result.map((item) => item.instanceId)).size).toBe(3);
    }
  });

  it("父取消传播到活动项，等待项和后继步骤不再启动", async () => {
    const node = iterationNode();
    node.config.items = { kind: "literal", value: [0, 1, 2, 3] };
    node.config.maxItems = 4;
    node.config.maxConcurrency = 2;
    const started: number[] = [];
    const aborted: number[] = [];
    let successorExecutions = 0;
    let releaseStarted!: () => void;
    const startedReady = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    const body = createWorkflow({
      id: "iteration-cancel-body",
      inputSchema: MASTRA_ITERATION_DESCRIPTOR_SCHEMA,
      outputSchema: MASTRA_ITERATION_RESULT_SCHEMA,
    }).then(createStep({
      id: "iteration-cancel-body-step",
      inputSchema: MASTRA_ITERATION_DESCRIPTOR_SCHEMA,
      outputSchema: MASTRA_ITERATION_RESULT_SCHEMA,
      execute: async ({ inputData, abortSignal }) => {
        started.push(inputData.index);
        if (started.length === 2) releaseStarted();
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 500);
            abortSignal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(abortSignal.reason ?? new Error("iteration cancelled"));
            }, { once: true });
          });
        } catch (error) {
          if (abortSignal.aborted) aborted.push(inputData.index);
          throw error;
        }
        return {
          index: inputData.index,
          instanceId: inputData.instanceId,
          status: "succeeded" as const,
          output: inputData.item,
          frame: inputData.frame,
        };
      },
    })).commit();
    const foreach = createMastraIterationForeachWorkflow(node, body, { maxParallelism: 2, maxItems: 4 });
    const successor = createStep({
      id: "iteration-successor",
      inputSchema: MASTRA_ITERATION_RESULTS_SCHEMA,
      outputSchema: MASTRA_ITERATION_RESULTS_SCHEMA,
      execute: async ({ inputData }) => {
        successorExecutions += 1;
        return inputData;
      },
    });
    const workflow = createWorkflow({
      id: "iteration-cancel-parent",
      inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      outputSchema: MASTRA_ITERATION_RESULTS_SCHEMA,
    }).then(foreach as never).then(successor).commit();
    const run = await workflow.createRun({ runId: "native-iteration-cancel" });
    const expectedCancellationLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const completion = run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-iteration-cancel" }) });
      await startedReady;
      await run.cancel();
      await expect(completion).resolves.toMatchObject({ status: "canceled" });
    } finally {
      expectedCancellationLog.mockRestore();
    }

    expect(started).toEqual([0, 1]);
    expect(aborted.sort((left, right) => left - right)).toEqual([0, 1]);
    expect(successorExecutions).toBe(0);
  });

  it("按 index 聚合 continue 与 collect-errors，fail-fast 保留原始错误", () => {
    const node = iterationNode();
    const parent = createMastraWorkflowFrame({ productRunId: "run-iteration" });
    const succeeded = [
      { index: 2, instanceId: "i2", status: "succeeded" as const, output: "c", frame: parent },
      { index: 0, instanceId: "i0", status: "succeeded" as const, output: "a", frame: parent },
    ];
    const failed = {
      index: 1,
      instanceId: "i1",
      status: "failed" as const,
      error: { code: "ITEM_FAILED", message: "item failed" },
      frame: parent,
    };

    node.config.failurePolicy = "continue";
    expect(mergeIterationResults(node, parent, [...succeeded, failed]).nodeOutputs["iteration-1"]).toEqual({ results: ["a", null, "c"] });
    node.config.aggregation = "by-index";
    expect(mergeIterationResults(node, parent, [...succeeded, failed]).nodeOutputs["iteration-1"]).toEqual({ results: { 0: "a", 1: null, 2: "c" } });

    node.config.failurePolicy = "collect-errors";
    node.config.aggregation = "ordered";
    expect(mergeIterationResults(node, parent, [...succeeded, failed]).nodeOutputs["iteration-1"]).toEqual({
      results: [
        { index: 0, status: "succeeded", output: "a" },
        { index: 1, status: "failed", error: { code: "ITEM_FAILED", message: "item failed" } },
        { index: 2, status: "succeeded", output: "c" },
      ],
    });

    node.config.failurePolicy = "fail-fast";
    expect(() => mergeIterationResults(node, parent, [...succeeded, failed])).toThrow(/item failed/);
  });
});
