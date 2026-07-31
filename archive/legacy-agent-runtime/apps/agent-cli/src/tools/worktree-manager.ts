import { mkdir, rm } from "node:fs/promises";
import { nowTimestampMs } from "../time.js";
import { runTaskSyncWorktreeState } from "./task-board.js";
import { WorktreeRunner } from "./worktree-runner.js";
import { WorktreeStore } from "./worktree-store.js";
import type { CloseoutAction, WorktreeRecord } from "./worktree-types.js";
import {
  WORKTREE_SCHEMA_VERSION,
  createWorktreeCloseout,
  dirtyWorktreeFailure,
  fail,
  makeWorktreeEventId,
  ok,
  previewCommand,
  validWorktreeName,
} from "./worktree-types.js";

export class WorktreeManager {
  constructor(
    private readonly store = new WorktreeStore(),
    private readonly runner = new WorktreeRunner(),
  ) {}

  async create(nameArg: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    if (!validWorktreeName(name)) {
      return fail("INVALID_WORKTREE_NAME", "name must match [A-Za-z0-9._-]{1,40}");
    }

    const records = await this.store.loadIndex();
    if (records.some((r) => r.name === name && r.status !== "removed")) {
      return fail("WORKTREE_EXISTS", `worktree ${name} exists`);
    }

    const targetPath = this.store.defaultPath(name);
    await mkdir(targetPath, { recursive: true });
    const now = nowTimestampMs();
    const record: WorktreeRecord = {
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      name,
      path: targetPath,
      status: "created",
      createdAt: now,
      updatedAt: now,
      lastEnteredAt: null,
      lastCommandAt: null,
      lastCommandPreview: null,
      closeout: null,
    };
    records.push(record);
    await this.store.saveIndex(records);
    await this.store.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: makeWorktreeEventId(),
      type: "create",
      name,
      at: nowTimestampMs(),
      detail: (await this.runner.isGitRepo()) ? "git_repo" : "workdir_fallback",
    });
    return ok({ worktree: record });
  }

  async list(): Promise<string> {
    const records = await this.store.loadIndex();
    return ok({ worktrees: records });
  }

  async enter(nameArg: unknown, taskIdArg?: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    if (!name) {
      return fail("INVALID_ARGUMENT", "worktree_enter requires name");
    }
    const records = await this.store.loadIndex();
    const record = records.find((r) => r.name === name && r.status !== "removed");
    if (!record) {
      return fail("WORKTREE_NOT_FOUND", `worktree ${name} not found`);
    }

    const now = nowTimestampMs();
    record.status = "entered";
    record.updatedAt = now;
    record.lastEnteredAt = now;
    record.closeout = null;
    record.schemaVersion = WORKTREE_SCHEMA_VERSION;
    await this.store.saveIndex(records);
    await this.store.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: makeWorktreeEventId(),
      type: "enter",
      name,
      at: now,
      detail: "entered",
    });
    await runTaskSyncWorktreeState(name, "entered", taskIdArg);
    return ok({ worktree: record });
  }

  async run(nameArg: unknown, commandArg: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    const command = String(commandArg ?? "").trim();
    if (!name || !command) {
      return fail("INVALID_ARGUMENT", "worktree_run requires name and command");
    }
    const records = await this.store.loadIndex();
    const record = records.find((r) => r.name === name && r.status !== "removed");
    if (!record) {
      return fail("WORKTREE_NOT_FOUND", `worktree ${name} not found`);
    }

    const result = await this.runner.run(command, record.path);
    record.status = "running";
    record.schemaVersion = WORKTREE_SCHEMA_VERSION;
    record.updatedAt = nowTimestampMs();
    record.lastCommandAt = record.updatedAt;
    record.lastCommandPreview = previewCommand(command);
    record.closeout = null;
    await this.store.saveIndex(records);
    await this.store.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: makeWorktreeEventId(),
      type: "run",
      name,
      at: nowTimestampMs(),
      detail: command,
    });
    await runTaskSyncWorktreeState(name, "running");
    return ok({
      worktree: record,
      exitCode: result.code,
      stdout: result.stdout.slice(0, 3000),
      stderr: result.stderr.slice(0, 3000),
    });
  }

  async closeout(nameArg: unknown, actionArg: unknown, taskIdArg?: unknown, forceArg?: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim();
    const action = String(actionArg ?? "").trim();
    const force = Boolean(forceArg);
    if (!name || (action !== "keep" && action !== "remove")) {
      return fail("INVALID_ARGUMENT", "worktree_closeout requires name and action=keep|remove");
    }
    const records = await this.store.loadIndex();
    const record = records.find((r) => r.name === name && r.status !== "removed");
    if (!record) {
      return fail("WORKTREE_NOT_FOUND", `worktree ${name} not found`);
    }

    const dirtyFiles = action === "remove" ? await this.runner.getDirtyFiles(record) : null;
    if (action === "remove" && dirtyFiles && dirtyFiles.length > 0 && !force) {
      return dirtyWorktreeFailure(name, dirtyFiles);
    }

    if (action === "remove") {
      await rm(record.path, { recursive: true, force: true });
    }

    const now = nowTimestampMs();
    record.status = action === "keep" ? "kept" : "removed";
    record.schemaVersion = WORKTREE_SCHEMA_VERSION;
    record.updatedAt = now;
    record.closeout = createWorktreeCloseout(action as CloseoutAction, force, now);
    await this.store.saveIndex(records);
    await this.store.appendEvent({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      id: makeWorktreeEventId(),
      type: "closeout",
      name,
      at: now,
      detail: JSON.stringify({ action, force, dirtyFiles: dirtyFiles ?? [] }),
    });
    await runTaskSyncWorktreeState(name, action === "keep" ? "kept" : "removed", taskIdArg, record.closeout);
    return ok({ worktree: record, closeout: record.closeout, dirtyFiles: dirtyFiles ?? [] });
  }

  async keep(nameArg: unknown, taskIdArg?: unknown): Promise<string> {
    return this.closeout(nameArg, "keep", taskIdArg, false);
  }

  async remove(nameArg: unknown, forceArg?: unknown, taskIdArg?: unknown): Promise<string> {
    return this.closeout(nameArg, "remove", taskIdArg, forceArg);
  }
}
