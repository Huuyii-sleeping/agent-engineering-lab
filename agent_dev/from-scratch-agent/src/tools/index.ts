import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { BASH_TOOLS, readCommandArgs, runBash } from "./bash.js";
import { FILE_TOOLS, runEditFile, runReadFile, runWriteFile } from "./file-tools.js";
import { TASK_TOOLS, runTaskCreate, runTaskGet, runTaskList, runTaskUpdate } from "./task-board.js";
import { TODO_TOOLS, runTodo } from "./todo.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

const UNKNOWN_TOOL = JSON.stringify({
  ok: false,
  error: { code: "UNKNOWN_TOOL", message: "未知工具" },
});

const TOOL_RUNTIME_ERROR = (message: string): string =>
  JSON.stringify({ ok: false, error: { code: "TOOL_RUNTIME_ERROR", message } });

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  bash: async (args) => runBash(String(args.command ?? "")),
  read_file: async (args) => runReadFile(args.path, args.limit),
  write_file: async (args) => runWriteFile(args.path, args.content),
  edit_file: async (args) => runEditFile(args.path, args.old_text, args.new_text),
  todo: async (args) => runTodo(args.items),
  task_create: async (args) => runTaskCreate(args.subject, args.description),
  task_update: async (args) =>
    runTaskUpdate(args.task_id, args.status, args.addBlockedBy, args.removeBlockedBy),
  task_list: async () => runTaskList(),
  task_get: async (args) => runTaskGet(args.task_id),
};

export const TOOLS: ChatCompletionTool[] = [...BASH_TOOLS, ...FILE_TOOLS, ...TODO_TOOLS, ...TASK_TOOLS];

function parseToolArgs(argumentsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argumentsJson || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function previewToolCall(name: string, argumentsJson: string): string {
  if (name === "bash") {
    return readCommandArgs(argumentsJson);
  }
  const args = parseToolArgs(argumentsJson);
  if (typeof args.path === "string") {
    return `${name} ${args.path}`;
  }
  if (name === "task_get" && args.task_id !== undefined) {
    return `${name} ${String(args.task_id)}`;
  }
  return name;
}

export async function runToolByName(name: string, argumentsJson: string): Promise<string> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return UNKNOWN_TOOL;
  }
  const args = parseToolArgs(argumentsJson);
  try {
    return await handler(args);
  } catch (error) {
    return TOOL_RUNTIME_ERROR(error instanceof Error ? error.message : String(error));
  }
}
