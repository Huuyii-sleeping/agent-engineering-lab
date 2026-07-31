import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SopDatabase } from "../../../src/sops/sop-database.js";
import { SqliteWorkflowRunsRepository } from "../../../src/workflow-runs/sqlite-workflow-runs.repository.js";
import type { WorkflowRunSnapshot } from "../../../src/workflow-runs/workflow-runs.types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), "orbit-workflow-runs-"));
  roots.push(root);
  const database = new SopDatabase({ sopDataRoot: root });
  return { database, repository: new SqliteWorkflowRunsRepository(database, { now: () => 50 }) };
}

function queuedRun(): WorkflowRunSnapshot {
  return {
    id: "run-1",
    workflowId: "workflow-1",
    versionId: "version-1",
    contentHash: "hash-1",
    mode: "production",
    status: "queued",
    createdAt: 10,
    inputs: { question: "hello" },
    nodeRuns: { node1: { nodeId: "node1", status: "pending", attempt: 0 } },
  };
}

describe("SqliteWorkflowRunsRepository", () => {
  it("保存运行、节点 attempt 和有序事件，并按事件 id 去重", async () => {
    const { database, repository } = await createRepository();
    try {
      repository.saveRun(queuedRun());
      const running = { id: 1, runId: "run-1", at: 20, type: "run.status", status: "running" } as const;
      const failed = { id: 2, runId: "run-1", at: 30, type: "node.status", nodeId: "node1", status: "failed", attempt: 2, error: { code: "FAILED", message: "boom", nodeId: "node1", attempt: 2 } } as const;
      const instance = { id: 3, runId: "run-1", at: 40, type: "node.status", nodeId: "node1", status: "running", attempt: 1, instanceId: "item-0", containerId: "iteration-1", iterationIndex: 0, childRunId: "child-1" } as const;
      const waiting = { id: 4, runId: "run-1", at: 50, type: "run.waiting", nodeId: "approval", reason: "Human approval pending", waiting: { kind: "approval", interruptId: "approval-1", approvalRequestId: "approval-1", deadline: 100, displayFields: [{ id: "summary", label: "摘要", value: "已脱敏" }], decisionSchema: { type: "object" } } } as const;
      expect(repository.saveEvent(running)).toBe(true);
      expect(repository.saveEvent(running)).toBe(false);
      expect(repository.saveEvent(failed)).toBe(true);
      expect(repository.saveEvent(instance)).toBe(true);
      expect(repository.saveEvent(waiting)).toBe(true);

      expect(repository.listEvents("run-1").map((event) => event.id)).toEqual([1, 2, 3, 4]);
      expect(repository.getRun("run-1")).toMatchObject({
        status: "running",
        startedAt: 20,
        nodeRuns: { node1: { status: "running", attempt: 1, error: { code: "FAILED", attempt: 2 } } },
        nodeInstances: { "node1::item-0": { instanceId: "item-0", containerId: "iteration-1", iterationIndex: 0 } },
        childRuns: { "child-1": { childRunId: "child-1", parentNodeId: "node1", status: "running" } },
        waiting: { nodeId: "approval", waiting: { kind: "approval", approvalRequestId: "approval-1" } },
      });
    } finally {
      database.onModuleDestroy();
    }
  });

  it("waiting 恢复窗口内保留技术状态，terminal retention 到期后按 run 级联清理", async () => {
    const { database, repository } = await createRepository();
    try {
      repository.saveRun({
        ...queuedRun(),
        id: "waiting-run",
        status: "waiting",
        createdAt: 1,
        waiting: {
          nodeId: "approval",
          reason: "Human approval pending",
          waiting: {
            kind: "approval",
            interruptId: "interrupt-waiting",
            approvalRequestId: "interrupt-waiting",
            deadline: 10_000,
            displayFields: [],
            decisionSchema: { type: "object" },
          },
        },
      });
      repository.saveRun({ ...queuedRun(), id: "terminal-run", status: "succeeded", createdAt: 1, finishedAt: 100 });
      repository.saveEvent({ id: 1, runId: "terminal-run", at: 100, type: "run.status", status: "succeeded" });

      expect(repository.cleanupExpired(250, 100)).toEqual(["terminal-run"]);
      expect(repository.getRun("waiting-run")).not.toBeNull();
      expect(repository.getRun("terminal-run")).toBeNull();
      expect(repository.listEvents("terminal-run")).toEqual([]);
      expect(database.database.prepare("select count(*) as total from workflow_node_runs where run_id = ?").get("terminal-run")).toEqual({ total: 0 });
    } finally {
      database.onModuleDestroy();
    }
  });
});
