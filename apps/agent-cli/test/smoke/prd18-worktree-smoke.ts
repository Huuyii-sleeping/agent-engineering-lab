import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { runTaskCreate, runTaskGet, runTaskList, runTaskUpdate } from "../../src/tools/task-board.js";
import {
  runWorktreeCloseout,
  runWorktreeCreate,
  runWorktreeEnter,
  runWorktreeRemove,
  runWorktreeRun,
} from "../../src/tools/worktree.js";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

async function resetRuntimeDirs(): Promise<void> {
  const targets = [".tasks", ".worktrees"];
  for (const target of targets) {
    const full = path.join(process.cwd(), target);
    await rm(full, { recursive: true, force: true }).catch(() => {});
    await mkdir(full, { recursive: true });
  }
}

async function main(): Promise<void> {
  await resetRuntimeDirs();

  const createdTask = parseJson<{ id: number }>(await runTaskCreate("prd18-task", "worktree lifecycle smoke"));
  const taskId = createdTask.id;
  await runTaskUpdate(taskId, "in_progress", undefined, undefined, "prd18-wt");

  const createdWorktree = parseJson<{ worktree: { path: string; schemaVersion: number } }>(await runWorktreeCreate("prd18-wt"));
  assert(createdWorktree.worktree.schemaVersion === 3, "worktree schema version should be upgraded to 3");

  const entered = parseJson<{ worktree: { status: string; lastEnteredAt: number | null } }>(
    await runWorktreeEnter("prd18-wt", taskId),
  );
  assert(entered.worktree.status === "entered", "worktree should become entered");
  assert(typeof entered.worktree.lastEnteredAt === "number", "worktree should record lastEnteredAt");

  const enteredTask = parseJson<{
    worktreeState: string;
    lastWorktree: string | null;
  }>(await runTaskGet(taskId));
  assert(enteredTask.worktreeState === "entered", "task should record entered worktree state");
  assert(enteredTask.lastWorktree === "prd18-wt", "task should record last_worktree");

  const runResult = parseJson<{
    exitCode: number;
    stdout: string;
    worktree: { status: string; lastCommandAt: number | null; lastCommandPreview: string | null };
  }>(await runWorktreeRun("prd18-wt", "echo PRD18_SMOKE"));
  assert(runResult.exitCode === 0, "worktree_run should succeed");
  assert(runResult.worktree.status === "running", "worktree should become running");
  assert(typeof runResult.worktree.lastCommandAt === "number", "worktree should record lastCommandAt");
  assert(runResult.worktree.lastCommandPreview?.includes("echo PRD18_SMOKE"), "worktree should record command preview");
  assert(runResult.stdout.includes("PRD18_SMOKE"), "worktree_run should capture stdout");

  const closed = parseJson<{
    worktree: { status: string; closeout: { action: string; forced: boolean } | null };
    closeout: { action: string; forced: boolean };
  }>(await runWorktreeCloseout("prd18-wt", "keep", false, taskId));
  assert(closed.worktree.status === "kept", "worktree_closeout keep should mark kept");
  assert(closed.closeout.action === "keep", "closeout action should be keep");

  const keptTask = parseJson<{
    worktree: string | null;
    worktreeState: string;
    lastWorktree: string | null;
    closeout: { action: string; forced: boolean } | null;
  }>(await runTaskGet(taskId));
  assert(keptTask.worktree === null, "task should clear active worktree after closeout");
  assert(keptTask.worktreeState === "kept", "task should record kept state");
  assert(keptTask.lastWorktree === "prd18-wt", "task should retain last_worktree after closeout");
  assert(keptTask.closeout?.action === "keep", "task closeout should sync from worktree");

  const listOutput = await runTaskList();
  assert(listOutput.includes("lane=kept"), "task_list should render lane state");
  assert(listOutput.includes("last_worktree=prd18-wt"), "task_list should render last_worktree");
  assert(listOutput.includes("closeout=keep@"), "task_list should render closeout summary");

  const dirtyCreate = parseJson<{ worktree: { path: string } }>(await runWorktreeCreate("prd18-dirty"));
  await runWorktreeRun("prd18-dirty", "git init");
  await writeFile(path.join(dirtyCreate.worktree.path, "dirty.txt"), "dirty-change\n", "utf8");

  const blockedRemove = parseJson<{ ok?: boolean; error?: { code?: string }; dirtyFiles?: string[] }>(
    await runWorktreeRemove("prd18-dirty"),
  );
  assert(blockedRemove.ok === false, "dirty worktree remove should be blocked by default");
  assert(blockedRemove.error?.code === "DIRTY_WORKTREE", "dirty worktree should return DIRTY_WORKTREE");
  assert(Array.isArray(blockedRemove.dirtyFiles) && blockedRemove.dirtyFiles.length > 0, "dirty files should be returned");

  const forcedRemove = parseJson<{ worktree: { status: string }; closeout: { action: string; forced: boolean } }>(
    await runWorktreeRemove("prd18-dirty", true),
  );
  assert(forcedRemove.worktree.status === "removed", "force remove should succeed");
  assert(forcedRemove.closeout.action === "remove", "forced remove should record remove closeout");
  assert(forcedRemove.closeout.forced === true, "forced remove should mark forced closeout");

  console.log("PRD18_WORKTREE_SMOKE_OK");
}

main().catch((error) => {
  console.error("PRD18_WORKTREE_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
