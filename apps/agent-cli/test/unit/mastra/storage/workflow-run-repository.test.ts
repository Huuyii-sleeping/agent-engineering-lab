import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MastraWorkflowRunRepository } from "../../../../src/mastra/storage/workflow-run-repository.js";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

function storedRun(runId = "run-1") {
  return {
    snapshot: {
      id: runId,
      workflowId: "workflow-1",
      mode: "draft" as const,
      status: "running" as const,
      createdAt: 1,
      startedAt: 1,
      inputs: {},
      nodeRuns: {},
    },
    nativeRunId: `native-${runId}`,
    runtimeWorkflowId: "runtime-1",
    ir: {
      irVersion: 1 as const,
      schemaVersion: 2 as const,
      source: { kind: "draft" as const, workflowId: "workflow-1", revision: 1, migrated: false },
      nodes: [],
      edges: [],
      topology: { orderedNodeIds: [], entryNodeIds: [], terminalNodeIds: [], dependencies: {}, dependents: {} },
      resourceBudget: {
        limits: { maxNodes: 1, maxEdges: 1, maxEstimatedSteps: 1, maxParallelism: 1, maxRuntimeMs: 1, maxOutputBytes: 1 },
        estimate: { nodeCount: 0, edgeCount: 0, estimatedSteps: 0, maxParallelism: 0 },
      },
      dependencies: [],
    },
  };
}

describe("mastra/storage/workflow-run-repository", () => {
  it("持久化恢复元数据并保持 Workflow 终态不可逆", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-runs-"));
    const repository = new MastraWorkflowRunRepository({ root });
    const running = storedRun();
    await repository.create(running);
    const completed = await repository.update({
      ...running,
      snapshot: { ...running.snapshot, status: "succeeded", finishedAt: 2 },
    });

    await expect(repository.update({
      ...completed,
      snapshot: { ...completed.snapshot, status: "failed" },
    })).resolves.toEqual(completed);
    await expect(new MastraWorkflowRunRepository({ root }).get("run-1")).resolves.toEqual(completed);
  });

  it("decision receipt 只在当前 run 内提供幂等/冲突语义，并按 TTL 清理", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-receipt-"));
    let now = 100;
    const repository = new MastraWorkflowRunRepository({
      root,
      now: () => now,
      decisionTtlMs: 20,
      terminalRetentionMs: 40,
    });
    const running = storedRun("receipt-run");
    await repository.create(running);

    await expect(repository.claimInterruptDecision({
      runId: "receipt-run",
      interruptId: "interrupt-1",
      idempotencyKey: "decision-1",
      decisionHash: "hash-1",
    })).resolves.toBe("claimed");
    await expect(repository.claimInterruptDecision({
      runId: "receipt-run",
      interruptId: "interrupt-1",
      idempotencyKey: "decision-1",
      decisionHash: "hash-conflict",
    })).resolves.toBe("conflict");

    const claimed = await repository.get("receipt-run");
    const completed = await repository.update({
      ...claimed!,
      snapshot: { ...claimed!.snapshot, status: "succeeded", finishedAt: now },
    });
    await expect(repository.claimInterruptDecision({
      runId: "receipt-run",
      interruptId: "interrupt-1",
      idempotencyKey: "decision-1",
      decisionHash: "hash-1",
    })).resolves.toBe("replay");

    now = 121;
    const retained = await repository.get("receipt-run");
    expect(retained).toMatchObject({ snapshot: { status: "succeeded" } });
    expect(retained).not.toHaveProperty("interruptDecision");
    now = 141;
    await expect(repository.cleanupExpired()).resolves.toEqual(["receipt-run"]);
    await expect(repository.get("receipt-run")).resolves.toBeNull();
    expect(completed.retentionExpiresAt).toBe(140);
  });

  it("waiting run 不因 decision TTL 到期被提前删除", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-waiting-retention-"));
    let now = 10;
    const repository = new MastraWorkflowRunRepository({ root, now: () => now, decisionTtlMs: 5, terminalRetentionMs: 5 });
    const waiting = {
      ...storedRun("waiting-run"),
      snapshot: { ...storedRun("waiting-run").snapshot, status: "waiting" as const },
    };
    await repository.create(waiting);
    await repository.claimInterruptDecision({
      runId: "waiting-run",
      interruptId: "interrupt-waiting",
      idempotencyKey: "decision-waiting",
      decisionHash: "hash-waiting",
    });
    now = 20;

    await expect(repository.cleanupExpired()).resolves.toEqual([]);
    const retained = await repository.get("waiting-run");
    expect(retained).toMatchObject({ snapshot: { status: "waiting" } });
    expect(retained).not.toHaveProperty("interruptDecision");
  });
});
