#!/usr/bin/env node
import dotenv from "dotenv";
import OpenAI from "openai";
import { exec, type ExecException } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const SYSTEM = `你是位于 ${WORKDIR} 的编程代理。请优先使用工具完成任务。`;

const THRESHOLD = 50_000;
const TRANSCRIPT_DIR = path.join(WORKDIR, ".transcripts");
const KEEP_RECENT = 3;
const PRESERVE_RESULT_TOOLS = new Set(["read_file"]);

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs) => Promise<string>;

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

function estimateTokens(messages: ChatCompletionMessageParam[]): number {
  return Math.floor(JSON.stringify(messages).length / 4);
}

function safePath(p: string): string {
  const resolved = path.resolve(WORKDIR, p);
  const relative = path.relative(WORKDIR, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return resolved;
}

function microCompact(messages: ChatCompletionMessageParam[]): void {
  const toolIndexes: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i] as unknown as Record<string, unknown>;
    if (msg.role === "tool" && typeof msg.content === "string") {
      toolIndexes.push(i);
    }
  }
  if (toolIndexes.length <= KEEP_RECENT) {
    return;
  }

  const toolNameById = new Map<string, string>();
  for (const msg of messages) {
    const m = msg as unknown as Record<string, unknown>;
    if (m.role !== "assistant" || !Array.isArray(m.tool_calls)) {
      continue;
    }
    for (const tc of m.tool_calls as Array<Record<string, unknown>>) {
      if (tc.type !== "function") {
        continue;
      }
      const id = String(tc.id ?? "");
      const fn = (tc.function ?? {}) as Record<string, unknown>;
      const name = String(fn.name ?? "unknown");
      if (id) {
        toolNameById.set(id, name);
      }
    }
  }

  const toClear = toolIndexes.slice(0, -KEEP_RECENT);
  for (const idx of toClear) {
    const msg = messages[idx] as unknown as Record<string, unknown>;
    if (typeof msg.content !== "string" || msg.content.length <= 100) {
      continue;
    }
    const toolCallId = String(msg.tool_call_id ?? "");
    const toolName = toolNameById.get(toolCallId) ?? "unknown";
    if (PRESERVE_RESULT_TOOLS.has(toolName)) {
      continue;
    }
    msg.content = `[Previous: used ${toolName}]`;
  }
}

async function autoCompact(messages: ChatCompletionMessageParam[]): Promise<ChatCompletionMessageParam[]> {
  await mkdir(TRANSCRIPT_DIR, { recursive: true });
  const transcriptPath = path.join(TRANSCRIPT_DIR, `transcript_${Date.now()}.jsonl`);
  const lines = messages.map((msg) => JSON.stringify(msg));
  await writeFile(transcriptPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`[transcript saved: ${transcriptPath}]`);

  const conversationText = JSON.stringify(messages).slice(-80_000);
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content:
          "Summarize this conversation for continuity. Include: " +
          "1) What was accomplished, 2) Current state, 3) Key decisions made. " +
          `Be concise but preserve critical details.\n\n${conversationText}`,
      },
    ],
    max_tokens: 2000,
  });

  const summary = response.choices[0]?.message?.content || "No summary generated.";
  return [
    {
      role: "user",
      content: `[Conversation compressed. Transcript: ${transcriptPath}]\n\n${summary}`,
    },
  ];
}

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
  compact: async () => "Manual compression requested.",
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
      name: "compact",
      description: "手动触发会话压缩。",
      parameters: {
        type: "object",
        properties: { focus: { type: "string", description: "What to preserve in summary" } },
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
    microCompact(messages);

    if (estimateTokens(messages) > THRESHOLD) {
      console.log("[auto_compact triggered]");
      const compacted = await autoCompact(messages);
      messages.splice(0, messages.length, ...compacted);
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

    let manualCompact = false;

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") {
        continue;
      }
      const toolName = toolCall.function.name;
      const args = parseArgs(toolCall.function.arguments || "{}");

      let output = "";
      if (toolName === "compact") {
        manualCompact = true;
        output = "Compressing...";
      } else {
        const handler = TOOL_HANDLERS[toolName];
        try {
          output = handler ? await handler(args) : `未知工具：${toolName}`;
        } catch (err) {
          output = `错误：${err instanceof Error ? err.message : String(err)}`;
        }
      }

      console.log(`> ${toolName}:`);
      console.log(output.slice(0, 200));
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: output,
      });
    }

    if (manualCompact) {
      console.log("[manual compact]");
      const compacted = await autoCompact(messages);
      messages.splice(0, messages.length, ...compacted);
      return;
    }
  }
}

async function main(): Promise<void> {
  const rl = createInterface({ input, output });
  const history: ChatCompletionMessageParam[] = [];

  try {
    while (true) {
      const query = await rl.question("\u001b[36ms06 >> \u001b[0m");
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
