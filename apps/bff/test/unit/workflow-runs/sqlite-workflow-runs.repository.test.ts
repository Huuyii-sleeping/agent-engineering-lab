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
  return { database, repository: new SqliteWorkflowRunsRepository(database) };
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
      expect(repository.saveEvent(running)).toBe(true);
      expect(repository.saveEvent(running)).toBe(false);
      expect(repository.saveEvent(failed)).toBe(true);

      expect(repository.listEvents("run-1").map((event) => event.id)).toEqual([1, 2]);
      expect(repository.getRun("run-1")).toMatchObject({
        status: "running",
        startedAt: 20,
        nodeRuns: { node1: { status: "failed", attempt: 2, error: { code: "FAILED", attempt: 2 } } },
      });
    } finally {
      database.onModuleDestroy();
    }
  });
});
