import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { runTaskCreate, runTaskUpdate } from "../tools/task-board.js";
import { runTeamAddTeammate, runTeamListRequests } from "../tools/team.js";
import { runWorktreeCreate, runWorktreeList, runWorktreeRemove } from "../tools/worktree.js";

async function resetRuntimeDirs(): Promise<void> {
  const targets = [".tasks", ".team", ".worktrees"];
  for (const target of targets) {
    const full = path.join(process.cwd(), target);
    await rm(full, { recursive: true, force: true }).catch(() => {});
    await mkdir(full, { recursive: true });
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function parseJson(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main(): Promise<void> {
  await resetRuntimeDirs();

  const created = parseJson(await runTaskCreate("prd13-smoke-task", "state transition check"));
  assert(typeof created.id === "number", "task_create should return id");
  assert(created.schemaVersion === 2, "task_create should write schemaVersion=2");

  const taskId = Number(created.id);
  const markCompleted = parseJson(await runTaskUpdate(taskId, "completed", undefined, undefined));
  assert(markCompleted.status === "completed", "task should become completed");

  const illegalBack = parseJson(await runTaskUpdate(taskId, "pending", undefined, undefined));
  assert(illegalBack.ok === false, "completed->pending should be rejected");
  assert(
    (illegalBack.error as { code?: string } | undefined)?.code === "INVALID_STATUS_TRANSITION",
    "illegal transition should return INVALID_STATUS_TRANSITION",
  );

  const teammate = parseJson(await runTeamAddTeammate("prd13_teammate"));
  const teammateObj = teammate.teammate as { schemaVersion?: number } | undefined;
  assert(teammateObj?.schemaVersion === 2, "team_add_teammate should write schemaVersion=2");

  const requests = parseJson(await runTeamListRequests());
  assert(Array.isArray(requests.requests), "team_list_requests should return requests array");

  const wtCreate = parseJson(await runWorktreeCreate("prd13-wt"));
  const wtObj = wtCreate.worktree as { schemaVersion?: number } | undefined;
  assert(wtObj?.schemaVersion === 2, "worktree_create should write schemaVersion=2");

  const wtList = parseJson(await runWorktreeList());
  const list = wtList.worktrees as Array<{ schemaVersion?: number }> | undefined;
  assert(Array.isArray(list) && list.length >= 1, "worktree_list should include created worktree");
  assert(list?.[0]?.schemaVersion === 2, "worktree_list should expose schemaVersion");

  const wtRemove = parseJson(await runWorktreeRemove("prd13-wt"));
  assert((wtRemove.worktree as { status?: string } | undefined)?.status === "removed", "worktree should be removed");

  console.log("PRD13_REGRESSION_OK");
}

main().catch((error) => {
  console.error("PRD13_REGRESSION_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

