import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TaskStore } from "../../../src/tools/task-store.js";
import type { Task } from "../../../src/tools/task-types.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function makeTasksRoot(): Promise<string> {
  tempDir = await mkdtemp(path.join(tmpdir(), "task-store-test-"));
  const tasksRoot = path.join(tempDir, ".tasks");
  await mkdir(tasksRoot, { recursive: true });
  return tasksRoot;
}

describe("tools/task-store", () => {
  it("normalizes legacy task records on load", async () => {
    const tasksRoot = await makeTasksRoot();
    await writeFile(
      path.join(tasksRoot, "task_1.json"),
      `${JSON.stringify({
        id: 1,
        subject: "legacy",
        description: "old task",
        status: "pending",
        blockedBy: ["2"],
        worktree: "lane-a",
        worktreeState: "unexpected",
        closeout: { action: "keep", at: "bad", forced: 1 },
      })}\n`,
      "utf8",
    );

    const store = new TaskStore(tasksRoot);
    const task = await store.load(1);

    expect(task).toMatchObject({
      schemaVersion: 3,
      id: 1,
      subject: "legacy",
      blockedBy: [2],
      worktree: "lane-a",
      worktreeState: "bound",
      lastWorktree: "lane-a",
      closeout: { action: "keep", forced: true },
    });
    expect(Number.isFinite(task.closeout?.at)).toBe(true);
  });

  it("clears blockedBy dependencies when requested", async () => {
    const tasksRoot = await makeTasksRoot();
    const store = new TaskStore(tasksRoot);

    await store.save({
      schemaVersion: 3,
      id: 1,
      subject: "a",
      description: "",
      status: "completed",
      blockedBy: [],
      owner: "",
      worktree: null,
      worktreeState: "none",
      lastWorktree: null,
      closeout: null,
    } satisfies Task);
    await store.save({
      schemaVersion: 3,
      id: 2,
      subject: "b",
      description: "",
      status: "pending",
      blockedBy: [1],
      owner: "",
      worktree: null,
      worktreeState: "none",
      lastWorktree: null,
      closeout: null,
    } satisfies Task);

    await store.clearDependency(1);

    await expect(store.load(2)).resolves.toMatchObject({ blockedBy: [] });
  });
});
