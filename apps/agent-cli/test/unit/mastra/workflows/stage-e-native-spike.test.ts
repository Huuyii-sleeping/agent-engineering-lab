import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  getOrCreateMastraRuntime,
  shutdownMastraRuntime,
} from "../../../../src/mastra/instance/factory.js";

const itemsInputSchema = z.object({ items: z.array(z.number()), concurrency: z.number().int().positive() });
const itemSchema = z.number();

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("aborted"));
    }, { once: true });
  });
}

describe("Mastra stage E native capability spike", () => {
  it("foreach 静态并发和 per-run resolver 在并发 run 中保持各自上限", async () => {
    const active = new Map<string, number>();
    const maximum = new Map<string, number>();
    const resolverInputs: number[] = [];
    const prepare = createStep({
      id: "prepare-items",
      inputSchema: itemsInputSchema,
      outputSchema: z.array(itemSchema),
      execute: async ({ inputData }) => inputData.items,
    });
    const body = createStep({
      id: "bounded-item",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
      execute: async ({ inputData, runId, abortSignal }) => {
        const current = (active.get(runId) ?? 0) + 1;
        active.set(runId, current);
        maximum.set(runId, Math.max(maximum.get(runId) ?? 0, current));
        try {
          await abortableDelay(10, abortSignal);
          return inputData * 2;
        } finally {
          active.set(runId, (active.get(runId) ?? 1) - 1);
        }
      },
    });
    const workflow = createWorkflow({
      id: "stage-e-foreach-resolver-spike",
      inputSchema: itemsInputSchema,
      outputSchema: z.array(itemSchema),
    })
      .then(prepare)
      .foreach(body, {
        concurrency: ({ getInitData }) => {
          const value = getInitData() as z.infer<typeof itemsInputSchema>;
          resolverInputs.push(value.concurrency);
          return value.concurrency;
        },
      })
      .commit();

    const [runTwo, runFour] = await Promise.all([
      workflow.createRun({ runId: "foreach-two" }),
      workflow.createRun({ runId: "foreach-four" }),
    ]);
    const [resultTwo, resultFour] = await Promise.all([
      runTwo.start({ inputData: { items: [1, 2, 3, 4, 5, 6], concurrency: 2 } }),
      runFour.start({ inputData: { items: [1, 2, 3, 4, 5, 6], concurrency: 4 } }),
    ]);

    expect(resultTwo).toMatchObject({ status: "success", result: [2, 4, 6, 8, 10, 12] });
    expect(resultFour).toMatchObject({ status: "success", result: [2, 4, 6, 8, 10, 12] });
    expect(maximum.get("foreach-two")).toBe(2);
    expect(maximum.get("foreach-four")).toBe(4);
    expect(resolverInputs).toEqual(expect.arrayContaining([2, 4]));

    const staticWorkflow = createWorkflow({
      id: "stage-e-foreach-static-spike",
      inputSchema: itemsInputSchema,
      outputSchema: z.array(itemSchema),
    }).then(prepare).foreach(body, { concurrency: 3 }).commit();
    const staticRun = await staticWorkflow.createRun({ runId: "foreach-static" });
    await expect(staticRun.start({ inputData: { items: [1, 2, 3, 4, 5], concurrency: 9 } })).resolves.toMatchObject({ status: "success" });
    expect(maximum.get("foreach-static")).toBe(3);
  });

  it("foreach 从 suspended snapshot resume 时按原始 initData 重算 concurrency", async () => {
    const resolverInputs: number[] = [];
    const prepare = createStep({
      id: "prepare-resumable-items",
      inputSchema: itemsInputSchema,
      outputSchema: z.array(itemSchema),
      execute: async ({ inputData }) => inputData.items,
    });
    const resumable = createStep({
      id: "resumable-item",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
      resumeSchema: z.object({ approved: z.boolean() }),
      suspendSchema: z.object({ item: z.number() }),
      execute: async ({ inputData, resumeData, suspend }) => {
        if (!resumeData) return suspend({ item: inputData }, { resumeLabel: `item-${inputData}` });
        return inputData;
      },
    });
    const workflow = createWorkflow({
      id: "stage-e-foreach-resume-spike",
      inputSchema: itemsInputSchema,
      outputSchema: z.array(itemSchema),
    }).then(prepare).foreach(resumable, {
      concurrency: ({ getInitData }) => {
        const value = getInitData() as z.infer<typeof itemsInputSchema>;
        resolverInputs.push(value.concurrency);
        return value.concurrency;
      },
    }).commit();
    const mastra = new Mastra({ storage: new InMemoryStore({ id: "foreach-resume-spike" }) });
    mastra.addWorkflow(workflow, workflow.id);
    try {
      const run = await workflow.createRun({ runId: "foreach-resume" });
      await expect(run.start({ inputData: { items: [0, 1], concurrency: 2 } })).resolves.toMatchObject({ status: "suspended" });
      await expect(run.resume({ step: "resumable-item", forEachIndex: 0, resumeData: { approved: true } })).resolves.toMatchObject({ status: "suspended" });
      await expect(run.resume({ step: "resumable-item", forEachIndex: 1, resumeData: { approved: true } })).resolves.toMatchObject({
        status: "success",
        result: [0, 1],
      });
      expect(resolverInputs).toEqual([2, 2, 2]);
    } finally {
      await mastra.shutdown();
    }
  });

  it("foreach fail-fast 停止等待项，但锁定版本不 abort 已活动 sibling", async () => {
    const started: number[] = [];
    const aborted: number[] = [];
    const prepare = createStep({
      id: "prepare-fail-fast",
      inputSchema: z.array(itemSchema),
      outputSchema: z.array(itemSchema),
      execute: async ({ inputData }) => inputData,
    });
    const body = createStep({
      id: "fail-fast-item",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
      execute: async ({ inputData, abortSignal }) => {
        started.push(inputData);
        if (inputData === 0) {
          await abortableDelay(5, abortSignal);
          throw new Error("branch failed");
        }
        try {
          await abortableDelay(100, abortSignal);
          return inputData;
        } catch (error) {
          if (abortSignal.aborted) aborted.push(inputData);
          throw error;
        }
      },
    });
    const workflow = createWorkflow({
      id: "stage-e-foreach-fail-fast-spike",
      inputSchema: z.array(itemSchema),
      outputSchema: z.array(itemSchema),
    }).then(prepare).foreach(body, { concurrency: 2 }).commit();
    const run = await workflow.createRun({ runId: "foreach-fail-fast" });
    const expectedFailureLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await run.start({ inputData: [0, 1, 2, 3] });
    expectedFailureLog.mockRestore();

    expect(result.status).toBe("failed");
    expect(started).toEqual([0, 1]);
    expect(aborted).toEqual([]);
  });

  it("nested Workflow 可作为 foreach、branch 和 loop step，并保留错误结果形态", async () => {
    const double = createStep({
      id: "nested-double-step",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
      execute: async ({ inputData }) => inputData * 2,
    });
    const nestedDouble = createWorkflow({
      id: "nested-double-workflow",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).then(double).commit();
    const prepare = createStep({
      id: "nested-prepare",
      inputSchema: z.array(itemSchema),
      outputSchema: z.array(itemSchema),
      execute: async ({ inputData }) => inputData,
    });
    const foreach = createWorkflow({
      id: "nested-foreach-parent",
      inputSchema: z.array(itemSchema),
      outputSchema: z.array(itemSchema),
    }).then(prepare).foreach(nestedDouble, { concurrency: 2 }).commit();
    const foreachRun = await foreach.createRun({ runId: "nested-foreach" });
    await expect(foreachRun.start({ inputData: [1, 2, 3] })).resolves.toMatchObject({
      status: "success",
      result: [2, 4, 6],
    });
    const streamRun = await foreach.createRun({ runId: "nested-foreach-stream" });
    const stream = streamRun.stream({ inputData: [4] });
    const streamEvents = [];
    for await (const event of stream.fullStream) streamEvents.push(event);
    await expect(stream.result).resolves.toMatchObject({ status: "success", result: [8] });
    expect(streamEvents.length).toBeGreaterThan(0);
    expect(JSON.stringify(streamEvents)).toContain("nested-double-workflow");

    const branch = createWorkflow({
      id: "nested-branch-parent",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).branch([[async ({ inputData }) => inputData > 0, nestedDouble]]).commit();
    const branchRun = await branch.createRun({ runId: "nested-branch" });
    await expect(branchRun.start({ inputData: 2 })).resolves.toMatchObject({
      status: "success",
      result: { "nested-double-workflow": 4 },
    });

    const increment = createStep({
      id: "nested-increment-step",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
      execute: async ({ inputData }) => inputData + 1,
    });
    const nestedIncrement = createWorkflow({
      id: "nested-increment-workflow",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).then(increment).commit();
    const loop = createWorkflow({
      id: "nested-loop-parent",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).dowhile(nestedIncrement, async ({ inputData }) => inputData < 3).commit();
    const loopRun = await loop.createRun({ runId: "nested-loop" });
    await expect(loopRun.start({ inputData: 0 })).resolves.toMatchObject({ status: "success", result: 3 });

    const fail = createStep({
      id: "nested-failure-step",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
      execute: async () => { throw new Error("nested failure"); },
    });
    const nestedFailure = createWorkflow({
      id: "nested-failure-workflow",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).then(fail).commit();
    const failedParent = createWorkflow({
      id: "nested-failure-parent",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).then(nestedFailure).commit();
    const failedRun = await failedParent.createRun({ runId: "nested-failure" });
    const expectedFailureLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(failedRun.start({ inputData: 1 })).resolves.toMatchObject({
        status: "failed",
        error: expect.objectContaining({ message: expect.stringContaining("nested failure") }),
      });
    } finally {
      expectedFailureLog.mockRestore();
    }
  });

  it("dowhile/dountil 暴露稳定 iterationCount，取消后不调用 condition", async () => {
    const whileCounts: number[] = [];
    const untilCounts: number[] = [];
    const increment = createStep({
      id: "loop-increment",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
      execute: async ({ inputData }) => inputData + 1,
    });
    const whileWorkflow = createWorkflow({
      id: "stage-e-dowhile-spike",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).dowhile(increment, async ({ inputData, iterationCount }) => {
      whileCounts.push(iterationCount);
      return inputData < 3;
    }).commit();
    const whileRun = await whileWorkflow.createRun({ runId: "dowhile-count" });
    await expect(whileRun.start({ inputData: 0 })).resolves.toMatchObject({ status: "success", result: 3 });
    expect(whileCounts).toEqual([1, 2, 3]);

    const untilWorkflow = createWorkflow({
      id: "stage-e-dountil-spike",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).dountil(increment, async ({ inputData, iterationCount }) => {
      untilCounts.push(iterationCount);
      return inputData >= 1;
    }).commit();
    const untilRun = await untilWorkflow.createRun({ runId: "dountil-count" });
    await expect(untilRun.start({ inputData: 0 })).resolves.toMatchObject({ status: "success", result: 1 });
    expect(untilCounts).toEqual([1]);

    const zeroGuardCounts: number[] = [];
    const rawWhile = createWorkflow({
      id: "stage-e-raw-dowhile-zero-spike",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).dowhile(increment, async ({ inputData, iterationCount }) => {
      zeroGuardCounts.push(iterationCount);
      return inputData < 3;
    }).commit();
    const rawWhileRun = await rawWhile.createRun({ runId: "raw-dowhile-zero" });
    await expect(rawWhileRun.start({ inputData: 3 })).resolves.toMatchObject({ status: "success", result: 4 });
    expect(zeroGuardCounts).toEqual([1]);

    let conditionCalls = 0;
    const slow = createStep({
      id: "loop-slow",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
      execute: async ({ inputData, abortSignal }) => {
        await abortableDelay(500, abortSignal);
        return inputData + 1;
      },
    });
    const cancellable = createWorkflow({
      id: "stage-e-loop-cancel-spike",
      inputSchema: itemSchema,
      outputSchema: itemSchema,
    }).dowhile(slow, async () => {
      conditionCalls += 1;
      return true;
    }).commit();
    const cancellableRun = await cancellable.createRun({ runId: "loop-cancel" });
    const completion = cancellableRun.start({ inputData: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const expectedCancellationLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await cancellableRun.cancel();
    await expect(completion).resolves.toMatchObject({ status: "canceled" });
    expectedCancellationLog.mockRestore();
    expect(conditionCalls).toBe(0);
  });

  it("loop 从持久 snapshot 恢复时不重复已完成 condition 或回退 iterationCount", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-stage-e-loop-spike-"));
    const conditionCounts: number[] = [];
    const executions: number[] = [];
    const createLoop = () => {
      const body = createStep({
        id: "resumable-loop-body",
        inputSchema: z.object({ count: z.number() }),
        outputSchema: z.object({ count: z.number() }),
        resumeSchema: z.object({ approved: z.boolean() }),
        suspendSchema: z.object({ count: z.number() }),
        execute: async ({ inputData, resumeData, suspend }) => {
          executions.push(inputData.count);
          if (inputData.count === 1 && !resumeData) {
            return suspend({ count: inputData.count }, { resumeLabel: "loop-gate" });
          }
          return { count: inputData.count + 1 };
        },
      });
      return createWorkflow({
        id: "stage-e-persistent-loop-spike",
        inputSchema: z.object({ count: z.number() }),
        outputSchema: z.object({ count: z.number() }),
      }).dowhile(body, async ({ inputData, iterationCount }) => {
        conditionCounts.push(iterationCount);
        return inputData.count < 3;
      }).commit();
    };

    try {
      const firstRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
      const firstWorkflow = createLoop();
      firstRuntime.mastra.addWorkflow(firstWorkflow, firstWorkflow.id);
      const firstRun = await firstWorkflow.createRun({ runId: "persistent-loop-run" });
      await expect(firstRun.start({ inputData: { count: 0 } })).resolves.toMatchObject({ status: "suspended" });
      expect(conditionCounts).toEqual([1]);
      await shutdownMastraRuntime({ root, persistenceEnabled: true });

      const restoredRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
      const restoredWorkflow = createLoop();
      restoredRuntime.mastra.addWorkflow(restoredWorkflow, restoredWorkflow.id);
      const restoredRun = await restoredWorkflow.createRun({ runId: "persistent-loop-run" });
      await expect(restoredRun.resume({
        step: "resumable-loop-body",
        resumeData: { approved: true },
      })).resolves.toMatchObject({ status: "success", result: { count: 3 } });

      expect(conditionCounts).toEqual([1, 2, 3]);
      expect(executions).toEqual([0, 1, 1, 2]);
    } finally {
      await shutdownMastraRuntime({ root, persistenceEnabled: true });
      await rm(root, { recursive: true, force: true });
    }
  });

  it("suspend/resume 保留 payload，重启后不重放已成功非幂等 step", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-stage-e-approval-spike-"));
    let nonIdempotentCalls = 0;
    let approvalExecutions = 0;
    const createApprovalWorkflow = () => {
      const sideEffect = createStep({
        id: "non-idempotent-side-effect",
        inputSchema: z.object({ requestId: z.string() }),
        outputSchema: z.object({ requestId: z.string(), externalId: z.string() }),
        execute: async ({ inputData }) => {
          nonIdempotentCalls += 1;
          return { ...inputData, externalId: `external-${nonIdempotentCalls}` };
        },
      });
      const approval = createStep({
        id: "approval-gate",
        inputSchema: z.object({ requestId: z.string(), externalId: z.string() }),
        outputSchema: z.object({ requestId: z.string(), externalId: z.string(), decision: z.string() }),
        resumeSchema: z.object({ decision: z.enum(["approved", "rejected"]) }),
        suspendSchema: z.object({ approvalRequestId: z.string(), externalId: z.string() }),
        execute: async ({ inputData, resumeData, suspend }) => {
          approvalExecutions += 1;
          if (!resumeData) {
            return suspend({ approvalRequestId: "approval-1", externalId: inputData.externalId }, { resumeLabel: "approval-1" });
          }
          return { ...inputData, decision: resumeData.decision };
        },
      });
      return createWorkflow({
        id: "stage-e-persistent-approval-spike",
        inputSchema: z.object({ requestId: z.string() }),
        outputSchema: z.object({ requestId: z.string(), externalId: z.string(), decision: z.string() }),
      }).then(sideEffect).then(approval).commit();
    };

    try {
      const firstRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
      const firstWorkflow = createApprovalWorkflow();
      firstRuntime.mastra.addWorkflow(firstWorkflow, firstWorkflow.id);
      const firstRun = await firstWorkflow.createRun({ runId: "persistent-approval-run" });
      await expect(firstRun.start({ inputData: { requestId: "request-1" } })).resolves.toMatchObject({
        status: "suspended",
        suspendPayload: {
          "approval-gate": { approvalRequestId: "approval-1", externalId: "external-1" },
        },
      });
      await shutdownMastraRuntime({ root, persistenceEnabled: true });

      const restoredRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
      const restoredWorkflow = createApprovalWorkflow();
      restoredRuntime.mastra.addWorkflow(restoredWorkflow, restoredWorkflow.id);
      const restoredRun = await restoredWorkflow.createRun({ runId: "persistent-approval-run" });
      await expect(restoredRun.resume({
        step: "approval-gate",
        resumeData: { decision: "approved" },
      })).resolves.toMatchObject({
        status: "success",
        result: { requestId: "request-1", externalId: "external-1", decision: "approved" },
      });
      expect(nonIdempotentCalls).toBe(1);
      expect(approvalExecutions).toBe(2);
      await expect(restoredRun.resume({
        step: "approval-gate",
        resumeData: { decision: "approved" },
      })).rejects.toThrow(/snapshot|suspend|resume/i);
    } finally {
      await shutdownMastraRuntime({ root, persistenceEnabled: true });
      await rm(root, { recursive: true, force: true });
    }
  });

  it("nested Workflow 的 suspended snapshot 可跨进程重建恢复", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-stage-e-nested-spike-"));
    let childSideEffects = 0;
    const createNested = () => {
      const childSideEffect = createStep({
        id: "nested-child-side-effect",
        inputSchema: z.object({ value: z.number() }),
        outputSchema: z.object({ value: z.number(), externalId: z.string() }),
        execute: async ({ inputData }) => {
          childSideEffects += 1;
          return { ...inputData, externalId: `nested-${childSideEffects}` };
        },
      });
      const childApproval = createStep({
        id: "nested-child-approval",
        inputSchema: z.object({ value: z.number(), externalId: z.string() }),
        outputSchema: z.object({ value: z.number(), externalId: z.string(), approved: z.boolean() }),
        resumeSchema: z.object({ approved: z.boolean() }),
        suspendSchema: z.object({ externalId: z.string() }),
        execute: async ({ inputData, resumeData, suspend }) => {
          if (!resumeData) return suspend({ externalId: inputData.externalId }, { resumeLabel: "nested-approval" });
          return { ...inputData, approved: resumeData.approved };
        },
      });
      const child = createWorkflow({
        id: "stage-e-persistent-nested-child",
        inputSchema: z.object({ value: z.number() }),
        outputSchema: z.object({ value: z.number(), externalId: z.string(), approved: z.boolean() }),
      }).then(childSideEffect).then(childApproval).commit();
      const parent = createWorkflow({
        id: "stage-e-persistent-nested-parent",
        inputSchema: z.object({ value: z.number() }),
        outputSchema: z.object({ value: z.number(), externalId: z.string(), approved: z.boolean() }),
      }).then(child).commit();
      return { parent, child, childApproval };
    };

    try {
      const firstRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
      const first = createNested();
      firstRuntime.mastra.addWorkflow(first.parent, first.parent.id);
      const firstRun = await first.parent.createRun({ runId: "persistent-nested-run" });
      await expect(firstRun.start({ inputData: { value: 7 } })).resolves.toMatchObject({ status: "suspended" });
      await shutdownMastraRuntime({ root, persistenceEnabled: true });

      const restoredRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
      const restored = createNested();
      restoredRuntime.mastra.addWorkflow(restored.parent, restored.parent.id);
      const restoredRun = await restored.parent.createRun({ runId: "persistent-nested-run" });
      await expect(restoredRun.resume({
        step: [restored.child, restored.childApproval],
        resumeData: { approved: true },
      })).resolves.toMatchObject({
        status: "success",
        result: { value: 7, externalId: "nested-1", approved: true },
      });
      expect(childSideEffects).toBe(1);
    } finally {
      await shutdownMastraRuntime({ root, persistenceEnabled: true });
      await rm(root, { recursive: true, force: true });
    }
  });
});
