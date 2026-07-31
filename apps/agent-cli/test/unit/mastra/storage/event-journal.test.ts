import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OrbitRuntimeEventJournal } from "../../../../src/mastra/storage/event-journal.js";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("mastra/storage/event-journal", () => {
  it("allocates monotonic ids per domain/run and restores persisted events", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-journal-"));
    const first = new OrbitRuntimeEventJournal({ root });

    const agentFirst = await first.appendAgent("shared-run", { type: "run.status", status: "running" });
    const agentSecond = await first.appendAgent("shared-run", { type: "text.delta", delta: "hello" });
    const workflowFirst = await first.appendWorkflow("shared-run", { type: "run.status", status: "queued" });

    expect([agentFirst.id, agentSecond.id]).toEqual([1, 2]);
    expect(workflowFirst.id).toBe(1);

    const restored = new OrbitRuntimeEventJournal({ root });
    await expect(restored.listAgent("shared-run", 1)).resolves.toMatchObject([
      { id: 2, type: "text.delta", delta: "hello" },
    ]);
    await expect(restored.listWorkflow("shared-run", 0)).resolves.toMatchObject([
      { id: 1, type: "run.status", status: "queued" },
    ]);
  });

  it("notifies only subscribers in the matching domain/run", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-journal-"));
    const journal = new OrbitRuntimeEventJournal({ root });
    const seen: string[] = [];
    const unsubscribe = journal.subscribeAgent("agent-run", (event) => seen.push(`${event.id}:${event.type}`));

    await journal.appendWorkflow("agent-run", { type: "run.status", status: "running" });
    await journal.appendAgent("agent-run", { type: "run.status", status: "running" });
    unsubscribe();

    expect(seen).toEqual(["1:run.status"]);
  });

  it("并发 append 仍为单个 run 原子分配严格递增 event id", async () => {
    const journal = new OrbitRuntimeEventJournal({ persistenceEnabled: false });
    const events = await Promise.all(Array.from({ length: 20 }, (_item, index) => (
      journal.appendWorkflow("concurrent-run", {
        type: "node.log",
        nodeId: "node",
        level: "info",
        message: String(index),
      })
    )));

    expect(events.map((event) => event.id).sort((left, right) => left - right)).toEqual(
      Array.from({ length: 20 }, (_item, index) => index + 1),
    );
    await expect(journal.listWorkflow("concurrent-run")).resolves.toHaveLength(20);
  });

  it("实例事件在并发写入和游标回放时保持严格递增产品 id", async () => {
    const journal = new OrbitRuntimeEventJournal({ persistenceEnabled: false });
    await Promise.all(Array.from({ length: 6 }, (_item, index) => (
      journal.appendWorkflow("instance-run", {
        type: "node.status",
        nodeId: "iteration-1",
        status: "succeeded",
        attempt: 1,
        containerId: "iteration-1",
        instanceId: `instance-${index}`,
        iterationIndex: index,
        executionPath: ["iteration-1", String(index)],
      })
    )));

    const events = await journal.listWorkflow("instance-run", 2);
    expect(events.map((event) => event.id)).toEqual([3, 4, 5, 6]);
    expect(events.every((event) => event.type === "node.status" && event.instanceId !== undefined)).toBe(true);
  });

  it("存储暂时不可用时明确失败，恢复后不占用或跳过产品 event id", async () => {
    root = path.join(tmpdir(), `orbit-mastra-journal-blocked-${Date.now()}`);
    await writeFile(root, "blocked", "utf8");
    const journal = new OrbitRuntimeEventJournal({ root, persistenceEnabled: true });

    await expect(journal.appendAgent("storage-run", {
      type: "run.status",
      status: "running",
    })).rejects.toThrow();

    await rm(root, { force: true });
    await mkdir(root, { recursive: true });
    const recovered = await journal.appendAgent("storage-run", {
      type: "run.status",
      status: "running",
    });

    expect(recovered.id).toBe(1);
    await expect(journal.listAgent("storage-run")).resolves.toEqual([recovered]);
  });
});
