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
const TEAM_DIR = path.join(WORKDIR, ".team");
const INBOX_DIR = path.join(TEAM_DIR, "inbox");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const SYSTEM = `你是位于 ${WORKDIR} 的团队负责人。请创建队友并通过收件箱通信。`;

const VALID_MSG_TYPES = [
  "message",
  "broadcast",
  "shutdown_request",
  "shutdown_response",
  "plan_approval_response",
] as const;
type MsgType = (typeof VALID_MSG_TYPES)[number];

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs) => Promise<string>;

type TeamMessage = {
  type: MsgType;
  from: string;
  content: string;
  timestamp: number;
} & Record<string, unknown>;

type MemberStatus = "working" | "idle" | "shutdown";
type TeamMember = {
  name: string;
  role: string;
  status: MemberStatus;
};
type TeamConfig = {
  team_name: string;
  members: TeamMember[];
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

function isMsgType(value: string): value is MsgType {
  return VALID_MSG_TYPES.includes(value as MsgType);
}

function safePath(p: string): string {
  const resolved = path.resolve(WORKDIR, p);
  const relative = path.relative(WORKDIR, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return resolved;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class MessageBus {
  private readonly dir: string;

  constructor(inboxDir: string) {
    this.dir = inboxDir;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private inboxPath(name: string): string {
    return path.join(this.dir, `${name}.jsonl`);
  }

  async send(
    sender: string,
    to: string,
    content: string,
    msgType: string = "message",
    extra?: Record<string, unknown>,
  ): Promise<string> {
    if (!isMsgType(msgType)) {
      return `错误：Invalid type '${msgType}'. Valid: ${VALID_MSG_TYPES.join(", ")}`;
    }
    const msg: TeamMessage = {
      type: msgType,
      from: sender,
      content,
      timestamp: Date.now() / 1000,
      ...(extra ?? {}),
    };
    const target = this.inboxPath(to);
    const prev = await readFile(target, "utf8").catch(() => "");
    await writeFile(target, `${prev}${JSON.stringify(msg)}\n`, "utf8");
    return `Sent ${msgType} to ${to}`;
  }

  async readInbox(name: string): Promise<TeamMessage[]> {
    const target = this.inboxPath(name);
    const text = await readFile(target, "utf8").catch(() => "");
    if (!text.trim()) {
      return [];
    }
    const messages: TeamMessage[] = [];
    for (const line of text.split(/\r?\n/)) {
      const row = line.trim();
      if (!row) {
        continue;
      }
      try {
        messages.push(JSON.parse(row) as TeamMessage);
      } catch {
        messages.push({
          type: "message",
          from: "system",
          content: row,
          timestamp: Date.now() / 1000,
        });
      }
    }
    await writeFile(target, "", "utf8");
    return messages;
  }

  async broadcast(sender: string, content: string, teammates: string[]): Promise<string> {
    let count = 0;
    for (const name of teammates) {
      if (name === sender) {
        continue;
      }
      await this.send(sender, name, content, "broadcast");
      count += 1;
    }
    return `Broadcast to ${count} teammates`;
  }
}

async function runBash(command: string): Promise<string> {
  const dangerous = ["rm -rf /", "sudo", "shutdown", "reboot"];
  if (dangerous.some((d) => command.includes(d))) {
    return "错误：已拦截危险命令";
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

class TeammateManager {
  private readonly dir: string;

  private readonly configPath: string;

  private config: TeamConfig = { team_name: "default", members: [] };

  private running = new Set<string>();

  constructor(teamDir: string, private readonly bus: MessageBus) {
    this.dir = teamDir;
    this.configPath = path.join(teamDir, "config.json");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    this.config = await this.loadConfig();
  }

  private async loadConfig(): Promise<TeamConfig> {
    const text = await readFile(this.configPath, "utf8").catch(() => "");
    if (!text) {
      return { team_name: "default", members: [] };
    }
    try {
      return JSON.parse(text) as TeamConfig;
    } catch {
      return { team_name: "default", members: [] };
    }
  }

  private async saveConfig(): Promise<void> {
    await writeFile(this.configPath, `${JSON.stringify(this.config, null, 2)}\n`, "utf8");
  }

  private findMember(name: string): TeamMember | undefined {
    return this.config.members.find((m) => m.name === name);
  }

  async spawn(name: string, role: string, prompt: string): Promise<string> {
    const member = this.findMember(name);
    if (member) {
      if (member.status !== "idle" && member.status !== "shutdown") {
        return `错误：'${name}' is currently ${member.status}`;
      }
      member.status = "working";
      member.role = role;
    } else {
      this.config.members.push({ name, role, status: "working" });
    }
    await this.saveConfig();

    this.running.add(name);
    void this.teammateLoop(name, role, prompt).finally(() => {
      this.running.delete(name);
    });
    return `Spawned '${name}' (role: ${role})`;
  }

  private teammateTools(): ChatCompletionTool[] {
    return [
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
            properties: { path: { type: "string" } },
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
          name: "send_message",
          description: "Send message to a teammate.",
          parameters: {
            type: "object",
            properties: {
              to: { type: "string" },
              content: { type: "string" },
              msg_type: { type: "string", enum: [...VALID_MSG_TYPES] },
            },
            required: ["to", "content"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "read_inbox",
          description: "读取并清空你的收件箱。",
          parameters: { type: "object", properties: {} },
        },
      },
    ];
  }

  private async teammateExec(sender: string, toolName: string, args: ToolArgs): Promise<string> {
    if (toolName === "bash") {
      return runBash(String(args.command ?? ""));
    }
    if (toolName === "read_file") {
      return runRead(String(args.path ?? ""));
    }
    if (toolName === "write_file") {
      return runWrite(String(args.path ?? ""), String(args.content ?? ""));
    }
    if (toolName === "edit_file") {
      return runEdit(
        String(args.path ?? ""),
        String(args.old_text ?? ""),
        String(args.new_text ?? ""),
      );
    }
    if (toolName === "send_message") {
      return this.bus.send(
        sender,
        String(args.to ?? ""),
        String(args.content ?? ""),
        String(args.msg_type ?? "message"),
      );
    }
    if (toolName === "read_inbox") {
      const inbox = await this.bus.readInbox(sender);
      return JSON.stringify(inbox, null, 2);
    }
    return `未知工具：${toolName}`;
  }

  private async teammateLoop(name: string, role: string, prompt: string): Promise<void> {
    const sysPrompt = `你是 '${name}'，角色为 ${role}，位于 ${WORKDIR}。请使用 send_message 与他人沟通，并完成分配任务。`;
    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: prompt }];
    const tools = this.teammateTools();

    for (let i = 0; i < 50; i += 1) {
      const inbox = await this.bus.readInbox(name);
      for (const msg of inbox) {
        messages.push({ role: "user", content: JSON.stringify(msg) });
      }

      let message: OpenAI.Chat.Completions.ChatCompletionMessage | undefined;
      try {
        const response = await client.chat.completions.create({
          model: MODEL,
          messages: [{ role: "system", content: sysPrompt }, ...messages],
          tools,
          max_tokens: 8000,
        });
        message = response.choices[0]?.message;
      } catch {
        break;
      }
      if (!message) {
        break;
      }

      messages.push(toAssistantMessage(message));
      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        break;
      }

      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") {
          continue;
        }
        const output = await this.teammateExec(
          name,
          toolCall.function.name,
          parseArgs(toolCall.function.arguments || "{}"),
        );
        console.log(`  [${name}] ${toolCall.function.name}: ${output.slice(0, 120)}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: output,
        });
      }
      await sleep(50);
    }

    const member = this.findMember(name);
    if (member && member.status !== "shutdown") {
      member.status = "idle";
      await this.saveConfig();
    }
  }

  async listAll(): Promise<string> {
    if (this.config.members.length === 0) {
      return "暂无队友。";
    }
    const lines = [`Team: ${this.config.team_name}`];
    for (const member of this.config.members) {
      lines.push(`  ${member.name} (${member.role}): ${member.status}`);
    }
    return lines.join("\n");
  }

  memberNames(): string[] {
    return this.config.members.map((m) => m.name);
  }
}

const BUS = new MessageBus(INBOX_DIR);
await BUS.init();
const TEAM = new TeammateManager(TEAM_DIR, BUS);
await TEAM.init();

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
  spawn_teammate: async (args) =>
    TEAM.spawn(String(args.name ?? ""), String(args.role ?? ""), String(args.prompt ?? "")),
  list_teammates: async () => TEAM.listAll(),
  send_message: async (args) =>
    BUS.send(
      "lead",
      String(args.to ?? ""),
      String(args.content ?? ""),
      String(args.msg_type ?? "message"),
    ),
  read_inbox: async () => JSON.stringify(await BUS.readInbox("lead"), null, 2),
  broadcast: async (args) =>
    BUS.broadcast("lead", String(args.content ?? ""), TEAM.memberNames()),
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
      name: "spawn_teammate",
      description: "Spawn a persistent teammate that runs in its own loop.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          prompt: { type: "string" },
        },
        required: ["name", "role", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_teammates",
      description: "List all teammates with name, role, status.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Send a message to a teammate inbox.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          content: { type: "string" },
          msg_type: { type: "string", enum: [...VALID_MSG_TYPES] },
        },
        required: ["to", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_inbox",
      description: "读取并清空负责人收件箱。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "broadcast",
      description: "向所有队友发送消息。",
      parameters: {
        type: "object",
        properties: { content: { type: "string" } },
        required: ["content"],
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
    const inbox = await BUS.readInbox("lead");
    if (inbox.length > 0) {
      messages.push({
        role: "user",
        content: `<inbox>${JSON.stringify(inbox, null, 2)}</inbox>`,
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
      const query = await rl.question("\u001b[36ms09 >> \u001b[0m");
      const cleaned = query.trim().toLowerCase();
      if (!query.trim() || cleaned === "q" || cleaned === "exit") {
        break;
      }
      if (query.trim() === "/team") {
        console.log(await TEAM.listAll());
        continue;
      }
      if (query.trim() === "/inbox") {
        console.log(JSON.stringify(await BUS.readInbox("lead"), null, 2));
        continue;
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
