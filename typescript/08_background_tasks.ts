#!/usr/bin/env node
import dotenv from "dotenv";
import OpenAI from "openai";
import { exec, type ExecException } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { randomUUID } from "node:crypto";
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

const SYSTEM = `你是位于 ${WORKDIR} 的编程代理。对长耗时命令请使用 background_run。`;

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs) => Promise<string>;
type BgStatus = "running" | "completed" | "timeout" | "error";
type BgTask = { status: BgStatus; result: string | null; command: string };
type Notification = {
  task_id: string;
  status: BgStatus;
  command: string;
  result: string;
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

class BackgroundManager {
  private readonly tasks = new Map<string, BgTask>();

  private readonly notificationQueue: Notification[] = [];

  run(command: string): string {
    const taskId = randomUUID().slice(0, 8);
    this.tasks.set(taskId, { status: "running", result: null, command });

    exec(
      command,
      { cwd: WORKDIR, timeout: 300_000, windowsHide: true },
      (error: ExecException | null, stdout: string, stderr: string) => {
        let status: BgStatus = "completed";
        let output = `${stdout}${stderr}`.trim().slice(0, 50_000);

        if (error) {
          if ((error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
            status = "timeout";
            output = "错误：超时（300秒）";
          } else {
            status = "error";
            output = output || `错误：${error.message}`;
          }
        }
        if (!output) {
          output = "(no output)";
        }

        this.tasks.set(taskId, { status, result: output, command });
        this.notificationQueue.push({
          task_id: taskId,
          status,
          command: command.slice(0, 80),
          result: output.slice(0, 500),
        });
      },
    );

    return `后台任务 ${taskId} 已启动：${command.slice(0, 80)}`;
  }

  check(taskId?: string): string {
    if (taskId) {
      const task = this.tasks.get(taskId);
      if (!task) {
        return `错误：未知任务 ${taskId}`;
      }
      return `[${task.status}] ${task.command.slice(0, 60)}\n${task.result ?? "(running)"}`;
    }

    const lines = Array.from(this.tasks.entries()).map(
      ([id, task]) => `${id}: [${task.status}] ${task.command.slice(0, 60)}`,
    );
    return lines.length ? lines.join("\n") : "暂无后台任务。";
  }

  drainNotifications(): Notification[] {
    const drained = [...this.notificationQueue];
    this.notificationQueue.length = 0;
    return drained;
  }
}

const BG = new BackgroundManager();

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
  background_run: async (args) => BG.run(String(args.command ?? "")),
  check_background: async (args) =>
    BG.check(typeof args.task_id === "string" ? args.task_id : undefined),
};

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "执行一个 shell 命令（阻塞）。",
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
      name: "background_run",
      description: "在后台运行命令，并立即返回 task_id。",
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
      name: "check_background",
      description: "检查后台任务状态；不传 task_id 时列出全部。",
      parameters: {
        type: "object",
        properties: { task_id: { type: "string" } },
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
    const notifs = BG.drainNotifications();
    if (notifs.length > 0 && messages.length > 0) {
      const notifText = notifs
        .map((n) => `[bg:${n.task_id}] ${n.status}: ${n.result}`)
        .join("\n");
      messages.push({
        role: "user",
        content: `<background-results>\n${notifText}\n</background-results>`,
      });
    }

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
      const query = await rl.question("\u001b[36ms08 >> \u001b[0m");
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
