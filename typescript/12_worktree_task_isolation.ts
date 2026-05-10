#!/usr/bin/env node
import dotenv from "dotenv";
import OpenAI from "openai";
import { exec, type ExecException } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

dotenv.config({ override: true });

const modelEnv = process.env.MODEL_ID;
if (!modelEnv) {
  throw new Error("缺少环境变量: MODEL_ID");
}
const MODEL = modelEnv;
const WORKDIR = process.cwd();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs) => Promise<string>;

type TaskStatus = "pending" | "in_progress" | "completed";
type TaskRow = {
  id: number;
  subject: string;
  description: string;
  status: TaskStatus;
  owner: string;
  worktree: string;
  blockedBy: number[];
  created_at: number;
  updated_at: number;
};

type WorktreeRow = {
  name: string;
  path: string;
  branch: string;
  task_id?: number;
  status: string;
  created_at?: number;
  removed_at?: number;
  kept_at?: number;
};

type WorktreeIndex = { worktrees: WorktreeRow[] };

async function detectRepoRoot(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    exec(
      "git rev-parse --show-toplevel",
      { cwd, timeout: 10_000, windowsHide: true },
      (error: ExecException | null, stdout: string) => {
        if (error) {
          resolve(null);
          return;
        }
        const root = stdout.trim();
        resolve(root || null);
      },
    );
  });
}

const REPO_ROOT = (await detectRepoRoot(WORKDIR)) ?? WORKDIR;

const SYSTEM = `你是位于 ${WORKDIR} 的编程代理。请使用 task + worktree 工具处理多任务工作。对于并行或高风险改动：先创建任务，再分配 worktree 执行通道，在通道内运行命令，最后根据情况选择 keep/remove 完成收尾。需要查看生命周期信息时使用 worktree_events。`;

function parseArgs(raw: string): ToolArgs {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as ToolArgs;
    }
    return {};
  } catch {
    return {};
  }
}

function safePath(p: string): string {
  const resolved = path.resolve(WORKDIR, p);
  const relative = path.relative(WORKDIR, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return resolved;
}

function toJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

class EventBus {
  constructor(private readonly eventLogPath: string) {}

  async init(): Promise<void> {
    await mkdir(path.dirname(this.eventLogPath), { recursive: true });
    await writeFile(this.eventLogPath, await readFile(this.eventLogPath, "utf8").catch(() => ""), "utf8");
  }

  async emit(
    event: string,
    task?: Record<string, unknown>,
    worktree?: Record<string, unknown>,
    error?: string,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      event,
      ts: Date.now(),
      task: task ?? {},
      worktree: worktree ?? {},
    };
    if (error) {
      payload.error = error;
    }
    const prev = await readFile(this.eventLogPath, "utf8").catch(() => "");
    await writeFile(this.eventLogPath, `${prev}${toJsonLine(payload)}`, "utf8");
  }

  async listRecent(limit = 20): Promise<string> {
    const n = Math.max(1, Math.min(Number(limit) || 20, 200));
    const text = await readFile(this.eventLogPath, "utf8").catch(() => "");
    const lines = text.split(/\r?\n/).filter(Boolean);
    const recent = lines.slice(-n);
    const rows = recent.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { event: "parse_error", raw: line };
      }
    });
    return JSON.stringify(rows, null, 2);
  }
}

class TaskManager {
  private nextId = 1;

  constructor(private readonly tasksDir: string) {}

  async init(): Promise<void> {
    await mkdir(this.tasksDir, { recursive: true });
    this.nextId = (await this.maxId()) + 1;
  }

  private taskPath(taskId: number): string {
    return path.join(this.tasksDir, `task_${taskId}.json`);
  }

  private async maxId(): Promise<number> {
    const files = (await readdir(this.tasksDir).catch(() => [])).filter((f) =>
      /^task_\d+\.json$/.test(f),
    );
    const ids = files.map((f) => Number((/^task_(\d+)\.json$/.exec(f) ?? [])[1] ?? 0));
    return ids.length ? Math.max(...ids) : 0;
  }

  private async load(taskId: number): Promise<TaskRow> {
    const text = await readFile(this.taskPath(taskId), "utf8").catch(() => "");
    if (!text) {
      throw new Error(`任务 ${taskId} 未找到`);
    }
    return JSON.parse(text) as TaskRow;
  }

  private async save(task: TaskRow): Promise<void> {
    await writeFile(this.taskPath(task.id), `${JSON.stringify(task, null, 2)}\n`, "utf8");
  }

  async create(subject: string, description = ""): Promise<string> {
    const now = Date.now();
    const task: TaskRow = {
      id: this.nextId,
      subject,
      description,
      status: "pending",
      owner: "",
      worktree: "",
      blockedBy: [],
      created_at: now,
      updated_at: now,
    };
    await this.save(task);
    this.nextId += 1;
    return JSON.stringify(task, null, 2);
  }

  async get(taskId: number): Promise<string> {
    return JSON.stringify(await this.load(taskId), null, 2);
  }

  async exists(taskId: number): Promise<boolean> {
    const text = await readFile(this.taskPath(taskId), "utf8").catch(() => "");
    return Boolean(text);
  }

  async update(taskId: number, status?: string, owner?: string): Promise<string> {
    const task = await this.load(taskId);
    if (status) {
      if (!["pending", "in_progress", "completed"].includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }
      task.status = status as TaskStatus;
    }
    if (typeof owner === "string") {
      task.owner = owner;
    }
    task.updated_at = Date.now();
    await this.save(task);
    return JSON.stringify(task, null, 2);
  }

  async bindWorktree(taskId: number, worktree: string, owner = ""): Promise<string> {
    const task = await this.load(taskId);
    task.worktree = worktree;
    if (owner) {
      task.owner = owner;
    }
    if (task.status === "pending") {
      task.status = "in_progress";
    }
    task.updated_at = Date.now();
    await this.save(task);
    return JSON.stringify(task, null, 2);
  }

  async unbindWorktree(taskId: number): Promise<string> {
    const task = await this.load(taskId);
    task.worktree = "";
    task.updated_at = Date.now();
    await this.save(task);
    return JSON.stringify(task, null, 2);
  }

  async listAll(): Promise<string> {
    const files = (await readdir(this.tasksDir).catch(() => [])).filter((f) =>
      /^task_\d+\.json$/.test(f),
    );
    files.sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));
    if (files.length === 0) {
      return "暂无任务。";
    }

    const lines: string[] = [];
    for (const file of files) {
      const task = JSON.parse(await readFile(path.join(this.tasksDir, file), "utf8")) as TaskRow;
      const marker =
        task.status === "pending" ? "[ ]" : task.status === "in_progress" ? "[>]" : "[x]";
      const owner = task.owner ? ` owner=${task.owner}` : "";
      const wt = task.worktree ? ` wt=${task.worktree}` : "";
      lines.push(`${marker} #${task.id}: ${task.subject}${owner}${wt}`);
    }
    return lines.join("\n");
  }
}

class WorktreeManager {
  private readonly dir: string;

  private readonly indexPath: string;

  public gitAvailable = false;

  constructor(
    private readonly repoRoot: string,
    private readonly tasks: TaskManager,
    private readonly events: EventBus,
  ) {
    this.dir = path.join(repoRoot, ".worktrees");
    this.indexPath = path.join(this.dir, "index.json");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const hasIndex = await readFile(this.indexPath, "utf8").then(Boolean).catch(() => false);
    if (!hasIndex) {
      await writeFile(this.indexPath, `${JSON.stringify({ worktrees: [] }, null, 2)}\n`, "utf8");
    }
    this.gitAvailable = await this.isGitRepo();
  }

  private async isGitRepo(): Promise<boolean> {
    return new Promise((resolve) => {
      exec(
        "git rev-parse --is-inside-work-tree",
        { cwd: this.repoRoot, timeout: 10_000, windowsHide: true },
        (error: ExecException | null) => {
          resolve(!error);
        },
      );
    });
  }

  private quoteArg(arg: string): string {
    if (/^[A-Za-z0-9._\-/:=]+$/.test(arg)) {
      return arg;
    }
    return `"${arg.replace(/"/g, '\\"')}"`;
  }

  private async runGit(args: string[]): Promise<string> {
    if (!this.gitAvailable) {
      throw new Error("Not in a git repository. worktree tools require git.");
    }
    const command = `git ${args.map((arg) => this.quoteArg(arg)).join(" ")}`;
    return new Promise((resolve, reject) => {
      exec(
        command,
        { cwd: this.repoRoot, timeout: 120_000, windowsHide: true },
        (error: ExecException | null, stdout: string, stderr: string) => {
          if (error) {
            const msg = `${stdout}${stderr}`.trim();
            reject(new Error(msg || `git ${args.join(" ")} failed`));
            return;
          }
          const out = `${stdout}${stderr}`.trim();
          resolve(out || "(no output)");
        },
      );
    });
  }

  private async loadIndex(): Promise<WorktreeIndex> {
    const text = await readFile(this.indexPath, "utf8");
    return JSON.parse(text) as WorktreeIndex;
  }

  private async saveIndex(index: WorktreeIndex): Promise<void> {
    await writeFile(this.indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  }

  private async find(name: string): Promise<WorktreeRow | undefined> {
    const index = await this.loadIndex();
    return index.worktrees.find((wt) => wt.name === name);
  }

  private validateName(name: string): void {
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(name)) {
      throw new Error("Invalid worktree name. Use 1-40 chars: letters, numbers, ., _, -");
    }
  }

  async create(name: string, taskId?: number, baseRef = "HEAD"): Promise<string> {
    this.validateName(name);
    if (await this.find(name)) {
      throw new Error(`Worktree '${name}' already exists in index`);
    }
    if (typeof taskId === "number" && !(await this.tasks.exists(taskId))) {
      throw new Error(`任务 ${taskId} 未找到`);
    }

    const wtPath = path.join(this.dir, name);
    const branch = `wt/${name}`;

    await this.events.emit(
      "worktree.create.before",
      typeof taskId === "number" ? { id: taskId } : {},
      { name, base_ref: baseRef },
    );

    try {
      await this.runGit(["worktree", "add", "-b", branch, wtPath, baseRef]);

      const entry: WorktreeRow = {
        name,
        path: wtPath,
        branch,
        task_id: taskId,
        status: "active",
        created_at: Date.now(),
      };
      const index = await this.loadIndex();
      index.worktrees.push(entry);
      await this.saveIndex(index);

      if (typeof taskId === "number") {
        await this.tasks.bindWorktree(taskId, name);
      }

      await this.events.emit(
        "worktree.create.after",
        typeof taskId === "number" ? { id: taskId } : {},
        { name, path: wtPath, branch, status: "active" },
      );
      return JSON.stringify(entry, null, 2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.events.emit(
        "worktree.create.failed",
        typeof taskId === "number" ? { id: taskId } : {},
        { name, base_ref: baseRef },
        message,
      );
      throw err;
    }
  }

  async listAll(): Promise<string> {
    const index = await this.loadIndex();
    if (index.worktrees.length === 0) {
      return "索引中暂无工作树。";
    }
    const lines = index.worktrees.map((wt) => {
      const suffix = typeof wt.task_id === "number" ? ` task=${wt.task_id}` : "";
      return `[${wt.status}] ${wt.name} -> ${wt.path} (${wt.branch})${suffix}`;
    });
    return lines.join("\n");
  }

  async status(name: string): Promise<string> {
    const wt = await this.find(name);
    if (!wt) {
      return `错误：Unknown worktree '${name}'`;
    }
    const wtPath = wt.path;
    const statusOutput = await new Promise<string>((resolve) => {
      exec(
        "git status --short --branch",
        { cwd: wtPath, timeout: 60_000, windowsHide: true },
        (error: ExecException | null, stdout: string, stderr: string) => {
          if (error) {
            resolve(`错误：${(stdout + stderr).trim() || error.message}`);
            return;
          }
          resolve((stdout + stderr).trim() || "Clean worktree");
        },
      );
    });
    return statusOutput;
  }

  async run(name: string, command: string): Promise<string> {
    const dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"];
    if (dangerous.some((d) => command.includes(d))) {
      return "错误：已拦截危险命令";
    }

    const wt = await this.find(name);
    if (!wt) {
      return `错误：Unknown worktree '${name}'`;
    }
    return new Promise((resolve) => {
      exec(
        command,
        { cwd: wt.path, timeout: 300_000, windowsHide: true },
        (error: ExecException | null, stdout: string, stderr: string) => {
          if (error) {
            if ((error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
              resolve("错误：超时（300秒）");
              return;
            }
            const out = `${stdout}${stderr}`.trim();
            resolve(out ? out.slice(0, 50_000) : `错误：${error.message}`);
            return;
          }
          const out = `${stdout}${stderr}`.trim();
          resolve(out ? out.slice(0, 50_000) : "(no output)");
        },
      );
    });
  }

  async remove(name: string, force = false, complete任务 = false): Promise<string> {
    const wt = await this.find(name);
    if (!wt) {
      return `错误：Unknown worktree '${name}'`;
    }

    await this.events.emit(
      "worktree.remove.before",
      typeof wt.task_id === "number" ? { id: wt.task_id } : {},
      { name, path: wt.path },
    );

    try {
      const args = ["worktree", "remove", ...(force ? ["--force"] : []), wt.path];
      await this.runGit(args);

      if (complete任务 && typeof wt.task_id === "number") {
        const before = JSON.parse(await this.tasks.get(wt.task_id)) as TaskRow;
        await this.tasks.update(wt.task_id, "completed");
        await this.tasks.unbindWorktree(wt.task_id);
        await this.events.emit(
          "task.completed",
          { id: wt.task_id, subject: before.subject, status: "completed" },
          { name },
        );
      }

      const index = await this.loadIndex();
      for (const item of index.worktrees) {
        if (item.name === name) {
          item.status = "removed";
          item.removed_at = Date.now();
        }
      }
      await this.saveIndex(index);

      await this.events.emit(
        "worktree.remove.after",
        typeof wt.task_id === "number" ? { id: wt.task_id } : {},
        { name, path: wt.path, status: "removed" },
      );
      return `Removed worktree '${name}'`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.events.emit(
        "worktree.remove.failed",
        typeof wt.task_id === "number" ? { id: wt.task_id } : {},
        { name, path: wt.path },
        message,
      );
      throw err;
    }
  }

  async keep(name: string): Promise<string> {
    const wt = await this.find(name);
    if (!wt) {
      return `错误：Unknown worktree '${name}'`;
    }
    const index = await this.loadIndex();
    let kept: WorktreeRow | undefined;
    for (const item of index.worktrees) {
      if (item.name === name) {
        item.status = "kept";
        item.kept_at = Date.now();
        kept = item;
      }
    }
    await this.saveIndex(index);
    await this.events.emit(
      "worktree.keep",
      typeof wt.task_id === "number" ? { id: wt.task_id } : {},
      { name, path: wt.path, status: "kept" },
    );
    return kept ? JSON.stringify(kept, null, 2) : `错误：Unknown worktree '${name}'`;
  }
}

const TASKS = new TaskManager(path.join(REPO_ROOT, ".tasks"));
await TASKS.init();
const EVENTS = new EventBus(path.join(REPO_ROOT, ".worktrees", "events.jsonl"));
await EVENTS.init();
const WORKTREES = new WorktreeManager(REPO_ROOT, TASKS, EVENTS);
await WORKTREES.init();

function runBash(command: string): Promise<string> {
  const dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"];
  if (dangerous.some((d) => command.includes(d))) {
    return Promise.resolve("错误：已拦截危险命令");
  }
  return new Promise((resolve) => {
    exec(
      command,
      { cwd: WORKDIR, timeout: 120_000, windowsHide: true },
      (error: ExecException | null, stdout: string, stderr: string) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
            resolve("错误：超时（120秒）");
            return;
          }
          const out = `${stdout}${stderr}`.trim();
          resolve(out ? out.slice(0, 50_000) : `错误：${error.message}`);
          return;
        }
        const out = `${stdout}${stderr}`.trim();
        resolve(out ? out.slice(0, 50_000) : "(no output)");
      },
    );
  });
}

async function runRead(pathArg: string, limit?: number): Promise<string> {
  try {
    let lines = (await readFile(safePath(pathArg), "utf8")).split(/\r?\n/);
    if (typeof limit === "number" && limit < lines.length) {
      lines = lines.slice(0, limit).concat([`... (${lines.length - limit} more)`]);
    }
    return lines.join("\n").slice(0, 50_000);
  } catch (err) {
    return `错误：${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runWrite(pathArg: string, content: string): Promise<string> {
  try {
    const target = safePath(pathArg);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    return `Wrote ${Buffer.byteLength(content, "utf8")} bytes`;
  } catch (err) {
    return `错误：${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runEdit(pathArg: string, oldText: string, newText: string): Promise<string> {
  try {
    const target = safePath(pathArg);
    const content = await readFile(target, "utf8");
    if (!content.includes(oldText)) {
      return `错误：在以下文件未找到文本：${pathArg}`;
    }
    await writeFile(target, content.replace(oldText, newText), "utf8");
    return `Edited ${pathArg}`;
  } catch (err) {
    return `错误：${err instanceof Error ? err.message : String(err)}`;
  }
}

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  bash: async (args) => runBash(String(args.command ?? "")),
  read_file: async (args) => {
    const raw = args.limit;
    const limit =
      typeof raw === "number" ? raw : Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    return runRead(String(args.path ?? ""), limit);
  },
  write_file: async (args) => runWrite(String(args.path ?? ""), String(args.content ?? "")),
  edit_file: async (args) =>
    runEdit(String(args.path ?? ""), String(args.old_text ?? ""), String(args.new_text ?? "")),
  task_create: async (args) =>
    TASKS.create(String(args.subject ?? ""), String(args.description ?? "")),
  task_list: async () => TASKS.listAll(),
  task_get: async (args) => TASKS.get(Number(args.task_id ?? 0)),
  task_update: async (args) =>
    TASKS.update(
      Number(args.task_id ?? 0),
      typeof args.status === "string" ? args.status : undefined,
      typeof args.owner === "string" ? args.owner : undefined,
    ),
  task_bind_worktree: async (args) =>
    TASKS.bindWorktree(
      Number(args.task_id ?? 0),
      String(args.worktree ?? ""),
      String(args.owner ?? ""),
    ),
  worktree_create: async (args) =>
    WORKTREES.create(
      String(args.name ?? ""),
      typeof args.task_id === "number" ? args.task_id : undefined,
      String(args.base_ref ?? "HEAD"),
    ),
  worktree_list: async () => WORKTREES.listAll(),
  worktree_status: async (args) => WORKTREES.status(String(args.name ?? "")),
  worktree_run: async (args) =>
    WORKTREES.run(String(args.name ?? ""), String(args.command ?? "")),
  worktree_keep: async (args) => WORKTREES.keep(String(args.name ?? "")),
  worktree_remove: async (args) =>
    WORKTREES.remove(
      String(args.name ?? ""),
      Boolean(args.force),
      Boolean(args.complete_task),
    ),
  worktree_events: async (args) => EVENTS.listRecent(Number(args.limit ?? 20)),
};

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "在当前工作区执行 shell 命令（阻塞）。",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取文件内容。",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, limit: { type: "integer" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "将内容写入文件。",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "在文件中精确替换文本。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_text: { type: "string" },
          new_text: { type: "string" },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_create",
      description: "Create a task on shared board.",
      parameters: {
        type: "object",
        properties: { subject: { type: "string" }, description: { type: "string" } },
        required: ["subject"],
      },
    },
  },
  { type: "function", function: { name: "task_list", description: "List all tasks.", parameters: { type: "object", properties: {} } } },
  {
    type: "function",
    function: {
      name: "task_get",
      description: "Get task details by ID.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "integer" } },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_update",
      description: "Update task status or owner.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          owner: { type: "string" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_bind_worktree",
      description: "Bind a task to a worktree name.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
          worktree: { type: "string" },
          owner: { type: "string" },
        },
        required: ["task_id", "worktree"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_create",
      description: "Create a git worktree and optionally bind to task.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          task_id: { type: "integer" },
          base_ref: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  { type: "function", function: { name: "worktree_list", description: "List worktrees tracked in index.", parameters: { type: "object", properties: {} } } },
  {
    type: "function",
    function: {
      name: "worktree_status",
      description: "Show git status for one worktree.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_run",
      description: "Run shell command in a named worktree.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          command: { type: "string" },
        },
        required: ["name", "command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_remove",
      description: "Remove worktree and optionally complete bound task.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          force: { type: "boolean" },
          complete_task: { type: "boolean" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_keep",
      description: "Mark worktree as kept without removing.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_events",
      description: "List recent worktree/task lifecycle events.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer" } },
      },
    },
  },
];

function toAssistantMessage(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): ChatCompletionMessageParam {
  const functionToolCalls = message.tool_calls?.filter(
    (toolCall): toolCall is ChatCompletionMessageFunctionToolCall => toolCall.type === "function",
  );

  return {
    role: "assistant",
    content: message.content ?? "",
    tool_calls: functionToolCalls?.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    })),
  };
}

async function agentLoop(messages: ChatCompletionMessageParam[]): Promise<void> {
  while (true) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      tools: TOOLS,
      max_tokens: 8000,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return;
    }
    messages.push(toAssistantMessage(message));

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return;
    }

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") {
        continue;
      }
      const toolName = toolCall.function.name;
      const handler = TOOL_HANDLERS[toolName];
      let output = "";
      try {
        output = handler
          ? await handler(parseArgs(toolCall.function.arguments || "{}"))
          : `未知工具：${toolName}`;
      } catch (err) {
        output = `错误：${err instanceof Error ? err.message : String(err)}`;
      }
      console.log(`> ${toolName}:`);
      console.log(output.slice(0, 200));
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: output,
      });
    }
  }
}

async function main(): Promise<void> {
  console.log(`Repo root for s12: ${REPO_ROOT}`);
  if (!WORKTREES.gitAvailable) {
    console.log("Note: Not in a git repo. worktree_* tools will return errors.");
  }

  const rl = createInterface({ input, output });
  const history: ChatCompletionMessageParam[] = [];

  try {
    while (true) {
      const query = await rl.question("\u001b[36ms12 >> \u001b[0m");
      const cleaned = query.trim().toLowerCase();
      if (!query.trim() || cleaned === "q" || cleaned === "exit") {
        break;
      }
      history.push({ role: "user", content: query });
      await agentLoop(history);

      const last = history[history.length - 1];
      if (last?.role === "assistant" && typeof last.content === "string" && last.content) {
        console.log(last.content);
      }
      console.log();
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
