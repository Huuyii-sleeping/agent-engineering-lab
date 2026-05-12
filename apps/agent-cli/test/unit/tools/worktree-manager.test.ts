import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/tools/task-board.js", () => ({
  runTaskSyncWorktreeState: vi.fn(async () => "{}"),
}));

import { runTaskSyncWorktreeState } from "../../../src/tools/task-board.js";
import { WorktreeManager } from "../../../src/tools/worktree-manager.js";
import { WorktreeStore } from "../../../src/tools/worktree-store.js";
import type { CommandResult, WorktreeRecord } from "../../../src/tools/worktree-types.js";

class FakeWorktreeRunner {
  dirtyFiles: string[] | null = null;

  async run(command: string): Promise<CommandResult> {
    return {
      code: command.includes("fail") ? 1 : 0,
      stdout: `ran ${command}`,
      stderr: command.includes("fail") ? "failed" : "",
    };
  }

  async isGitRepo(): Promise<boolean> {
    return false;
  }

  async getDirtyFiles(_record: WorktreeRecord): Promise<string[] | null> {
    return this.dirtyFiles;
  }
}

let tempDir = "";

afterEach(async () => {
  vi.mocked(runTaskSyncWorktreeState).mockClear();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function makeManager(): Promise<{ manager: WorktreeManager; runner: FakeWorktreeRunner }> {
  tempDir = await mkdtemp(path.join(tmpdir(), "worktree-manager-test-"));
  const runner = new FakeWorktreeRunner();
  return {
    manager: new WorktreeManager(new WorktreeStore(path.join(tempDir, ".worktrees")), runner),
    runner,
  };
}

describe("tools/worktree-manager", () => {
  it("creates enters runs and keeps a worktree while syncing task state", async () => {
    const { manager } = await makeManager();

    const created = JSON.parse(await manager.create("lane-a")) as { worktree: WorktreeRecord };
    expect(created.worktree).toMatchObject({ schemaVersion: 3, name: "lane-a", status: "created" });

    const entered = JSON.parse(await manager.enter("lane-a", 7)) as { worktree: WorktreeRecord };
    expect(entered.worktree.status).toBe("entered");
    expect(typeof entered.worktree.lastEnteredAt).toBe("number");

    const run = JSON.parse(await manager.run("lane-a", "echo    hello")) as {
      worktree: WorktreeRecord;
      exitCode: number;
      stdout: string;
    };
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("echo    hello");
    expect(run.worktree).toMatchObject({ status: "running", lastCommandPreview: "echo hello" });

    const kept = JSON.parse(await manager.keep("lane-a", 7)) as { worktree: WorktreeRecord };
    expect(kept.worktree).toMatchObject({ status: "kept", closeout: { action: "keep", forced: false } });

    expect(vi.mocked(runTaskSyncWorktreeState).mock.calls).toEqual([
      ["lane-a", "entered", 7],
      ["lane-a", "running"],
      ["lane-a", "kept", 7, expect.objectContaining({ action: "keep", forced: false })],
    ]);
  });

  it("blocks dirty remove by default and allows forced remove", async () => {
    const { manager, runner } = await makeManager();
    await manager.create("dirty-lane");

    runner.dirtyFiles = ["M dirty.txt"];
    const blocked = JSON.parse(await manager.remove("dirty-lane")) as {
      ok?: boolean;
      error?: { code?: string };
      dirtyFiles?: string[];
    };
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe("DIRTY_WORKTREE");
    expect(blocked.dirtyFiles).toEqual(["M dirty.txt"]);

    const removed = JSON.parse(await manager.remove("dirty-lane", true, 9)) as { worktree: WorktreeRecord };
    expect(removed.worktree).toMatchObject({ status: "removed", closeout: { action: "remove", forced: true } });
    expect(vi.mocked(runTaskSyncWorktreeState)).toHaveBeenLastCalledWith(
      "dirty-lane",
      "removed",
      9,
      expect.objectContaining({ action: "remove", forced: true }),
    );
  });
});
