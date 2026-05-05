import type { ChatCompletionTool } from "openai/resources/chat/completions";
import {
  runAutonomyMarkActive,
  runAutonomySetOwner,
  runAutonomyStatus,
  runAutonomyTick,
} from "./autonomy.js";
import { BASH_TOOLS, readCommandArgs, runBash } from "./bash.js";
import { BACKGROUND_TOOLS, runBackgroundRun, runCheckBackground } from "./background-task.js";
import { CONTEXT_TOOLS, type CompactRuntimeContext, runCompact, runEstimateTokens } from "./context-compact.js";
import { FILE_TOOLS, runEditFile, runReadFile, runWriteFile } from "./file-tools.js";
import {
  TASK_TOOLS,
  runTaskCreate,
  runTaskGet,
  runTaskList,
  runTaskUpdate,
} from "./task-board.js";
import {
  TEAM_TOOLS,
  runTeamAddTeammate,
  runTeamBroadcast,
  runTeamListRequests,
  runTeamListTeammates,
  runTeamMessage,
  runTeamPlanApprovalRequest,
  runTeamPlanApprovalResponse,
  runTeamReadInbox,
  runTeamSetStatus,
  runTeamShutdownRequest,
  runTeamShutdownResponse,
} from "./team.js";
import { TODO_TOOLS, runTodo } from "./todo.js";
import {
  WORKTREE_TOOLS,
  runWorktreeCreate,
  runWorktreeKeep,
  runWorktreeList,
  runWorktreeRemove,
  runWorktreeRun,
} from "./worktree.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export const BASE_UNKNOWN_TOOL = JSON.stringify({
  ok: false,
  error: { code: "UNKNOWN_TOOL", message: "未知工具" },
});

const TOOL_RUNTIME_ERROR = (message: string): string =>
  JSON.stringify({ ok: false, error: { code: "TOOL_RUNTIME_ERROR", message } });

const BASE_HANDLERS: Record<string, ToolHandler> = {
  bash: async (args) => runBash(String(args.command ?? "")),
  read_file: async (args) => runReadFile(args.path, args.limit),
  write_file: async (args) => runWriteFile(args.path, args.content),
  edit_file: async (args) => runEditFile(args.path, args.old_text, args.new_text),
  todo: async (args) => runTodo(args.items),
  task_create: async (args) => runTaskCreate(args.subject, args.description),
  task_update: async (args) =>
    runTaskUpdate(args.task_id, args.status, args.addBlockedBy, args.removeBlockedBy, args.worktree),
  task_list: async () => runTaskList(),
  task_get: async (args) => runTaskGet(args.task_id),
  estimate_tokens: async () => runEstimateTokens(runtimeContext),
  compact: async (args) => runCompact(args.keep_recent, runtimeContext),
  background_run: async (args) => runBackgroundRun(args.command),
  check_background: async (args) => runCheckBackground(args.task_id),
  team_add_teammate: async (args) => runTeamAddTeammate(args.name),
  team_set_status: async (args) => runTeamSetStatus(args.teammate_id, args.status),
  team_message: async (args) => runTeamMessage(args.teammate_id, args.content, args.from),
  team_broadcast: async (args) => runTeamBroadcast(args.content, args.from),
  team_shutdown_request: async (args) => runTeamShutdownRequest(args.teammate_id, args.payload, args.from),
  team_shutdown_response: async (args) =>
    runTeamShutdownResponse(args.request_id, args.approve, args.note, args.from),
  team_plan_approval_request: async (args) =>
    runTeamPlanApprovalRequest(args.teammate_id, args.payload, args.from),
  team_plan_approval_response: async (args) =>
    runTeamPlanApprovalResponse(args.request_id, args.approve, args.note, args.from),
  team_list_teammates: async () => runTeamListTeammates(),
  team_read_inbox: async (args) => runTeamReadInbox(args.teammate_id),
  team_list_requests: async () => runTeamListRequests(),
  worktree_create: async (args) => runWorktreeCreate(args.name),
  worktree_list: async () => runWorktreeList(),
  worktree_run: async (args) => runWorktreeRun(args.name, args.command),
  worktree_keep: async (args) => runWorktreeKeep(args.name),
  worktree_remove: async (args) => runWorktreeRemove(args.name),
  autonomy_set_owner: async (args) => runAutonomySetOwner(args.owner),
  autonomy_status: async () => runAutonomyStatus(),
  autonomy_tick: async () => runAutonomyTick(),
  autonomy_mark_active: async () => runAutonomyMarkActive(),
};

export const BASE_TOOLS: ChatCompletionTool[] = [
  ...BASH_TOOLS,
  ...FILE_TOOLS,
  ...TODO_TOOLS,
  ...TASK_TOOLS,
  ...CONTEXT_TOOLS,
  ...BACKGROUND_TOOLS,
  ...TEAM_TOOLS,
  ...WORKTREE_TOOLS,
  {
    type: "function",
    function: {
      name: "autonomy_set_owner",
      description: "Set autonomous owner identity.",
      parameters: {
        type: "object",
        properties: { owner: { type: "string" } },
        required: ["owner"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "autonomy_status",
      description: "Get autonomy runtime status.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "autonomy_tick",
      description: "Run one autonomy poll cycle and attempt claim.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "autonomy_mark_active",
      description: "Mark runtime active and reset idle timeout.",
      parameters: { type: "object", properties: {} },
    },
  },
];

let runtimeContext: CompactRuntimeContext | undefined;

export function setCompactRuntimeContext(context: CompactRuntimeContext): void {
  runtimeContext = context;
}

function parseToolArgs(argumentsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argumentsJson || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function previewBaseToolCall(name: string, argumentsJson: string): string {
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

export async function runBaseToolByName(name: string, argumentsJson: string): Promise<string> {
  const handler = BASE_HANDLERS[name];
  if (!handler) {
    return BASE_UNKNOWN_TOOL;
  }
  const args = parseToolArgs(argumentsJson);
  try {
    return await handler(args);
  } catch (error) {
    return TOOL_RUNTIME_ERROR(error instanceof Error ? error.message : String(error));
  }
}
