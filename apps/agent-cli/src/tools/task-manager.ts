import { TaskStore } from "./task-store.js";
import {
  normalizeTaskCloseout,
  normalizeWorktreeState,
  TASK_SCHEMA_VERSION,
  toTaskError,
  type Task,
  type TaskStatus,
  type WorktreeState,
} from "./task-types.js";

export class TaskManager {
  constructor(private readonly store = new TaskStore()) {}

  async create(subjectArg: unknown, descriptionArg: unknown): Promise<string> {
    const subject = String(subjectArg ?? "").trim();
    const description = String(descriptionArg ?? "");
    if (!subject) {
      return toTaskError("INVALID_ARGUMENT", "task_create requires subject");
    }
    const task: Task = {
      schemaVersion: TASK_SCHEMA_VERSION,
      id: await this.store.allocateId(),
      subject,
      description,
      status: "pending",
      blockedBy: [],
      owner: "",
      worktree: null,
      worktreeState: "none",
      lastWorktree: null,
      closeout: null,
    };
    await this.store.save(task);
    return JSON.stringify(task, null, 2);
  }

  async get(taskIdArg: unknown): Promise<string> {
    const taskId = Number(taskIdArg);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return toTaskError("INVALID_ARGUMENT", "task_get requires positive task_id");
    }
    try {
      return JSON.stringify(await this.store.load(taskId), null, 2);
    } catch (error) {
      return toTaskError("TASK_NOT_FOUND", error instanceof Error ? error.message : String(error));
    }
  }

  async listAll(): Promise<string> {
    const tasks = await this.store.allTasks();
    if (tasks.length === 0) {
      return "No tasks.";
    }

    const lines: string[] = [];
    for (const task of tasks) {
      const marker = task.status === "pending" ? "[ ]" : task.status === "in_progress" ? "[>]" : "[x]";
      const blocked = task.blockedBy.length > 0 ? ` blockedBy=${JSON.stringify(task.blockedBy)}` : "";
      const worktree = task.worktree ? ` worktree=${task.worktree}` : "";
      const lane = ` lane=${task.worktreeState}`;
      const lastWorktree = task.lastWorktree ? ` last_worktree=${task.lastWorktree}` : "";
      const closeout = task.closeout
        ? ` closeout=${task.closeout.action}@${task.closeout.at}${task.closeout.forced ? ":forced" : ""}`
        : "";
      lines.push(`${marker} #${task.id}: ${task.subject}${blocked}${worktree}${lane}${lastWorktree}${closeout}`);
    }
    return lines.join("\n");
  }

  async update(
    taskIdArg: unknown,
    statusArg: unknown,
    addBlockedByArg: unknown,
    removeBlockedByArg: unknown,
    worktreeArg?: unknown,
    worktreeStateArg?: unknown,
    lastWorktreeArg?: unknown,
    closeoutArg?: unknown,
  ): Promise<string> {
    const taskId = Number(taskIdArg);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return toTaskError("INVALID_ARGUMENT", "task_update requires positive task_id");
    }

    let task: Task;
    try {
      task = await this.store.load(taskId);
    } catch (error) {
      return toTaskError("TASK_NOT_FOUND", error instanceof Error ? error.message : String(error));
    }

    if (statusArg !== undefined) {
      const status = String(statusArg);
      if (status !== "pending" && status !== "in_progress" && status !== "completed") {
        return toTaskError("INVALID_ARGUMENT", `invalid status ${status}`);
      }
      if (task.status === "completed" && status !== "completed") {
        return toTaskError("INVALID_STATUS_TRANSITION", "completed task cannot transition back");
      }
      if (task.status === "in_progress" && status === "pending") {
        return toTaskError("INVALID_STATUS_TRANSITION", "in_progress task cannot transition to pending");
      }
      task.status = status as TaskStatus;
      if (status === "completed") {
        await this.store.clearDependency(taskId);
      }
    }

    const addBlockedBy = Array.isArray(addBlockedByArg)
      ? addBlockedByArg.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    const removeBlockedBy = Array.isArray(removeBlockedByArg)
      ? removeBlockedByArg.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (addBlockedBy.length > 0) {
      task.blockedBy = Array.from(new Set([...task.blockedBy, ...addBlockedBy]));
    }
    if (removeBlockedBy.length > 0) {
      task.blockedBy = task.blockedBy.filter((id) => !removeBlockedBy.includes(id));
    }

    if (worktreeArg !== undefined) {
      const worktree = String(worktreeArg ?? "").trim();
      task.worktree = worktree || null;
      if (worktree) {
        task.lastWorktree = worktree;
        if (worktreeStateArg === undefined) {
          task.worktreeState = "bound";
        }
      } else if (worktreeStateArg === undefined) {
        task.worktreeState = "none";
      }
    }

    if (worktreeStateArg !== undefined) {
      const fallbackState: WorktreeState = task.worktree ? "bound" : "none";
      task.worktreeState = normalizeWorktreeState(worktreeStateArg, fallbackState);
    }

    if (lastWorktreeArg !== undefined) {
      const lastWorktree = String(lastWorktreeArg ?? "").trim();
      task.lastWorktree = lastWorktree || null;
    }

    if (closeoutArg !== undefined) {
      task.closeout = normalizeTaskCloseout(closeoutArg);
    }
    task.schemaVersion = TASK_SCHEMA_VERSION;

    await this.store.save(task);
    return JSON.stringify(task, null, 2);
  }

  async scanUnclaimedTasks(): Promise<string> {
    const tasks = await this.store.allTasks();
    const unclaimed = tasks.filter((task) => !String(task.owner ?? "").trim() && task.status !== "completed");
    return JSON.stringify({ ok: true, tasks: unclaimed }, null, 2);
  }

  async claimTask(taskIdArg: unknown, ownerArg: unknown): Promise<string> {
    const taskId = Number(taskIdArg);
    const owner = String(ownerArg ?? "").trim();
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return toTaskError("INVALID_ARGUMENT", "claim_task requires positive task_id");
    }
    if (!owner) {
      return toTaskError("INVALID_ARGUMENT", "claim_task requires owner");
    }

    let task: Task;
    try {
      task = await this.store.load(taskId);
    } catch (error) {
      return toTaskError("TASK_NOT_FOUND", error instanceof Error ? error.message : String(error));
    }

    if (task.owner && task.owner !== owner) {
      return toTaskError("TASK_ALREADY_CLAIMED", `task ${taskId} already claimed by ${task.owner}`);
    }
    if (task.status === "completed") {
      return toTaskError("INVALID_STATUS_TRANSITION", `task ${taskId} is completed and cannot be claimed`);
    }

    task.owner = owner;
    if (task.status === "pending") {
      task.status = "in_progress";
    }
    task.schemaVersion = TASK_SCHEMA_VERSION;
    await this.store.save(task);
    return JSON.stringify({ ok: true, task }, null, 2);
  }

  async syncWorktreeState(
    worktreeNameArg: unknown,
    worktreeStateArg: unknown,
    taskIdArg?: unknown,
    closeoutArg?: unknown,
  ): Promise<string> {
    const worktreeName = String(worktreeNameArg ?? "").trim();
    if (!worktreeName) {
      return toTaskError("INVALID_ARGUMENT", "worktree name is required");
    }

    const worktreeState = normalizeWorktreeState(worktreeStateArg, "none");
    const explicitTaskId = Number(taskIdArg);
    const tasks = await this.store.allTasks();
    const targets = Number.isInteger(explicitTaskId) && explicitTaskId > 0
      ? tasks.filter((task) => task.id === explicitTaskId)
      : tasks.filter((task) => task.worktree === worktreeName || task.lastWorktree === worktreeName);
    if (targets.length === 0) {
      return JSON.stringify({ ok: true, updated: [] }, null, 2);
    }

    const closeout = closeoutArg !== undefined ? normalizeTaskCloseout(closeoutArg) : undefined;
    for (const task of targets) {
      task.lastWorktree = worktreeName;
      task.worktreeState = worktreeState;
      if (worktreeState === "removed" || worktreeState === "kept") {
        task.worktree = null;
      } else if (!task.worktree) {
        task.worktree = worktreeName;
      }
      if (closeout !== undefined) {
        task.closeout = closeout;
      }
      task.schemaVersion = TASK_SCHEMA_VERSION;
      await this.store.save(task);
    }

    return JSON.stringify(
      {
        ok: true,
        updated: targets.map((task) => ({
          id: task.id,
          worktree: task.worktree,
          worktreeState: task.worktreeState,
          lastWorktree: task.lastWorktree,
          closeout: task.closeout,
        })),
      },
      null,
      2,
    );
  }
}
