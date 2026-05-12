import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TaskManager } from "../../../src/tools/task-manager.js";
import { TaskStore } from "../../../src/tools/task-store.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function makeManager(): Promise<TaskManager> {
  tempDir = await mkdtemp(path.join(tmpdir(), "task-manager-test-"));
  return new TaskManager(new TaskStore(path.join(tempDir, ".tasks")));
}

describe("tools/task-manager", () => {
  it("creates updates completes and lists tasks while clearing dependencies", async () => {
    const manager = await makeManager();

    const first = JSON.parse(await manager.create("task-a", "first")) as { id: number; schemaVersion: number };
    const second = JSON.parse(await manager.create("task-b", "second")) as { id: number };

    expect(first.schemaVersion).toBe(3);

    await manager.update(second.id, "pending", [first.id], undefined, "lane-a");
    const bound = JSON.parse(await manager.get(second.id)) as {
      blockedBy: number[];
      worktree: string | null;
      worktreeState: string;
      lastWorktree: string | null;
    };
    expect(bound).toMatchObject({
      blockedBy: [first.id],
      worktree: "lane-a",
      worktreeState: "bound",
      lastWorktree: "lane-a",
    });

    await manager.update(first.id, "completed", undefined, undefined);
    const unblocked = JSON.parse(await manager.get(second.id)) as { blockedBy: number[] };
    expect(unblocked.blockedBy).toEqual([]);

    const listed = await manager.listAll();
    expect(listed).toContain(`#${second.id}: task-b`);
    expect(listed).toContain("worktree=lane-a");
    expect(listed).toContain("lane=bound");
  });

  it("keeps claim and worktree sync behavior stable", async () => {
    const manager = await makeManager();
    const created = JSON.parse(await manager.create("task-a", "claimable")) as { id: number };

    const scan = JSON.parse(await manager.scanUnclaimedTasks()) as { ok: boolean; tasks: Array<{ id: number }> };
    expect(scan.ok).toBe(true);
    expect(scan.tasks.map((task) => task.id)).toEqual([created.id]);

    const claimed = JSON.parse(await manager.claimTask(created.id, "alice")) as {
      ok: boolean;
      task: { owner: string; status: string };
    };
    expect(claimed).toMatchObject({ ok: true, task: { owner: "alice", status: "in_progress" } });

    const conflict = JSON.parse(await manager.claimTask(created.id, "bob")) as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(conflict.ok).toBe(false);
    expect(conflict.error?.code).toBe("TASK_ALREADY_CLAIMED");

    const entered = JSON.parse(await manager.syncWorktreeState("lane-a", "entered", created.id)) as {
      ok: boolean;
      updated: Array<{
        id: number;
        worktree: string | null;
        worktreeState: string;
        lastWorktree: string | null;
        closeout: { action: string; at: number; forced: boolean } | null;
      }>;
    };
    expect(entered.ok).toBe(true);
    expect(entered.updated).toMatchObject([
      { id: created.id, worktree: "lane-a", worktreeState: "entered", lastWorktree: "lane-a", closeout: null },
    ]);

    const closed = JSON.parse(
      await manager.syncWorktreeState("lane-a", "removed", created.id, { action: "remove", at: 123, forced: true }),
    ) as {
      updated: Array<{
        id: number;
        worktree: string | null;
        worktreeState: string;
        lastWorktree: string | null;
        closeout: { action: string; at: number; forced: boolean } | null;
      }>;
    };
    expect(closed.updated).toMatchObject([
      {
        id: created.id,
        worktree: null,
        worktreeState: "removed",
        lastWorktree: "lane-a",
        closeout: { action: "remove", at: 123, forced: true },
      },
    ]);
  });
});
