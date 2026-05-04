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
const TASKS_DIR = path.join(WORKDIR, ".tasks");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const SYSTEM = `你是位于 ${WORKDIR} 的编程代理。请使用任务工具规划并跟踪工作。`;

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs) => Promise<string>;
type TaskStatus = "pending" | "in_progress" | "completed";

type Task = {
  id: number;
  subject: string;
  description: string;
  status: TaskStatus;
  blockedBy: number[];
  owner: string;
};

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

class TaskManager {
  private readonly dir: string;

  private nextId = 1;

  constructor(tasksDir: string) {
    this.dir = tasksDir;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    this.nextId = (await this.maxId()) + 1;
  }

  private taskPath(taskId: number): string {
    return path.join(this.dir, `task_${taskId}.json`);
  }

  private async maxId(): Promise<number> {
    const files = await readdir(this.dir).catch(() => []);
    const ids = files
      .map((f) => /^task_(\d+)\.json$/.exec(f)?.[1])
      .filter((v): v is string => Boolean(v))
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    return ids.length ? Math.max(...ids) : 0;
  }

  private async load(taskId: number): Promise<Task> {
    const target = this.taskPath(taskId);
    const text = await readFile(target, "utf8").catch(() => "");
    if (!text) {
      throw new Error(`任务 ${taskId} 未找到`);
    }
    return JSON.parse(text) as Task;
  }

  private async save(task: Task): Promise<void> {
    await writeFile(this.taskPath(task.id), `${JSON.stringify(task, null, 2)}\n`, "utf8");
  }

  async create(subject: string, description = ""): Promise<string> {
    const task: Task = {
      id: this.nextId,
      subject,
      description,
      status: "pending",
      blockedBy: [],
      owner: "",
    };
    await this.save(task);
    this.nextId += 1;
    return JSON.stringify(task, null, 2);
  }

  async get(taskId: number): Promise<string> {
    return JSON.stringify(await this.load(taskId), null, 2);
  }

  async update(
    taskId: number,
    status?: string,
    addBlockedBy?: number[],
    removeBlockedBy?: number[],
  ): Promise<string> {
    const task = await this.load(taskId);
    if (status) {
      if (!["pending", "in_progress", "completed"].includes(status)) {
        throw new Error(`无效状态: ${status}`);
      }
      task.status = status as TaskStatus;
      if (status === "completed") {
        await this.clearDependency(taskId);
      }
    }

    if (Array.isArray(addBlockedBy) && addBlockedBy.length > 0) {
      task.blockedBy = Array.from(new Set([...task.blockedBy, ...addBlockedBy]));
    }
    if (Array.isArray(removeBlockedBy) && removeBlockedBy.length > 0) {
      task.blockedBy = task.blockedBy.filter((id) => !removeBlockedBy.includes(id));
    }

    await this.save(task);
    return JSON.stringify(task, null, 2);
  }

  private async clearDependency(completedId: number): Promise<void> {
    const files = (await readdir(this.dir)).filter((f) => /^task_\d+\.json$/.test(f));
    for (const file of files) {
      const full = path.join(this.dir, file);
      const task = JSON.parse(await readFile(full, "utf8")) as Task;
      if (task.blockedBy.includes(completedId)) {
        task.blockedBy = task.blockedBy.filter((id) => id !== completedId);
        await this.save(task);
      }
    }
  }

  async listAll(): Promise<string> {
    const files = (await readdir(this.dir)).filter((f) => /^task_(\d+)\.json$/.test(f));
    files.sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));

    const tasks: Task[] = [];
    for (const file of files) {
      tasks.push(JSON.parse(await readFile(path.join(this.dir, file), "utf8")) as Task);
    }

    if (tasks.length === 0) {
      return "暂无任务。";
    }

    const lines: string[] = [];
    for (const task of tasks) {
      const marker =
        task.status === "pending" ? "[ ]" : task.status === "in_progress" ? "[>]" : "[x]";
      const blocked =
        task.blockedBy.length > 0 ? ` (被阻塞: ${JSON.stringify(task.blockedBy)})` : "";
      lines.push(`${marker} #${task.id}: ${task.subject}${blocked}`);
    }
    return lines.join("\n");
  }
}

const TASKS = new TaskManager(TASKS_DIR);
await TASKS.init();

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
    return `已写入 ${Buffer.byteLength(content, "utf8")} 字节`;
  } catch (err) {
    return `错误：${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runEdit(pathArg: string, oldText: string, newText: string): Promise<string> {
  try {
    const target = safePath(pathArg);
    const content = await readFile(target, "utf8");
    if (!content.includes(oldText)) {
      return `错误：在文件中未找到指定文本 ${pathArg}`;
    }
    await writeFile(target, content.replace(oldText, newText), "utf8");
    return `已编辑 ${pathArg}`;
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
  task_update: async (args) => {
    const taskId = Number(args.task_id ?? 0);
    const status = typeof args.status === "string" ? args.status : undefined;
    const addBlockedBy = Array.isArray(args.addBlockedBy)
      ? args.addBlockedBy.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : undefined;
    const removeBlockedBy = Array.isArray(args.removeBlockedBy)
      ? args.removeBlockedBy.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : undefined;
    return TASKS.update(taskId, status, addBlockedBy, removeBlockedBy);
  },
  task_list: async () => TASKS.listAll(),
  task_get: async (args) => TASKS.get(Number(args.task_id ?? 0)),
};

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "执行一个 shell 命令。",
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
      description: "创建一个新任务。",
      parameters: {
        type: "object",
        properties: { subject: { type: "string" }, description: { type: "string" } },
        required: ["subject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_update",
      description: "更新任务状态或依赖关系。",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          addBlockedBy: { type: "array", items: { type: "integer" } },
          removeBlockedBy: { type: "array", items: { type: "integer" } },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_list",
      description: "列出所有任务摘要。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "task_get",
      description: "按 ID 获取任务详情。",
      parameters: {
        type: "object",
        properties: { task_id: { type: "integer" } },
        required: ["task_id"],
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
  const rl = createInterface({ input, output });
  const history: ChatCompletionMessageParam[] = [];

  try {
    while (true) {
      const query = await rl.question("\u001b[36ms07 >> \u001b[0m");
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
