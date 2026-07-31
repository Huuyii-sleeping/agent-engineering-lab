import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import {
  normalizeTaskCloseout,
  normalizeWorktreeState,
  TASK_SCHEMA_VERSION,
  type Task,
  type TaskStatus,
  type WorktreeState,
} from "./task-types.js";

export class TaskStore {
  private nextId = 1;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly dir = path.join(process.cwd(), ".tasks")) {}

  private taskPath(taskId: number): string {
    return path.join(this.dir, `task_${taskId}.json`);
  }

  private async maxId(): Promise<number> {
    const files = await readdir(this.dir).catch(() => []);
    const ids = files
      .map((file) => /^task_(\d+)\.json$/.exec(file)?.[1])
      .filter((value): value is string => Boolean(value))
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    return ids.length === 0 ? 0 : Math.max(...ids);
  }

  async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(this.dir, { recursive: true });
        this.nextId = (await this.maxId()) + 1;
      })();
    }
    await this.initPromise;
  }

  normalizeTask(parsed: Partial<Task>): Task {
    const worktree = parsed.worktree ? String(parsed.worktree) : null;
    const fallbackWorktreeState: WorktreeState = worktree ? "bound" : "none";
    return {
      schemaVersion: TASK_SCHEMA_VERSION,
      id: Number(parsed.id),
      subject: String(parsed.subject ?? ""),
      description: String(parsed.description ?? ""),
      status: (parsed.status as TaskStatus) ?? "pending",
      blockedBy: Array.isArray(parsed.blockedBy) ? parsed.blockedBy.map((id) => Number(id)) : [],
      owner: String(parsed.owner ?? ""),
      worktree,
      worktreeState: normalizeWorktreeState(parsed.worktreeState, fallbackWorktreeState),
      lastWorktree: parsed.lastWorktree ? String(parsed.lastWorktree) : worktree,
      closeout: normalizeTaskCloseout(parsed.closeout),
    };
  }

  async allocateId(): Promise<number> {
    await this.ensureInit();
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  async loadByPath(taskPath: string): Promise<Task> {
    await this.ensureInit();
    const raw = await readFile(taskPath, "utf8").catch(() => "");
    if (!raw) {
      throw new Error(`task file ${taskPath} not found`);
    }
    return this.normalizeTask(JSON.parse(raw) as Partial<Task>);
  }

  async load(taskId: number): Promise<Task> {
    try {
      return await this.loadByPath(this.taskPath(taskId));
    } catch {
      throw new Error(`task ${taskId} not found`);
    }
  }

  async save(task: Task): Promise<void> {
    await this.ensureInit();
    await writeFile(this.taskPath(task.id), `${JSON.stringify(task, null, 2)}\n`, "utf8");
  }

  async allTasks(): Promise<Task[]> {
    await this.ensureInit();
    const files = (await readdir(this.dir)).filter((file) => /^task_\d+\.json$/.test(file));
    const tasks = await Promise.all(files.map((file) => this.loadByPath(path.join(this.dir, file))));
    tasks.sort((left, right) => left.id - right.id);
    return tasks;
  }

  async clearDependency(completedId: number): Promise<void> {
    const tasks = await this.allTasks();
    for (const task of tasks) {
      if (task.blockedBy.includes(completedId)) {
        task.blockedBy = task.blockedBy.filter((id) => id !== completedId);
        await this.save(task);
      }
    }
  }
}
