import { AsyncLocalStorage } from "node:async_hooks";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { executeProtectedToolHandler } from "../runtime/tool-runtime.js";
import { DEFAULT_DELIVERY_SERVICE } from "../delivery-service.js";
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
import { DEFAULT_MEMORY_SERVICE } from "../memory-service.js";
import { MEMORY_TOOLS } from "./memory.js";
import {
  TASK_TOOLS,
  runTaskCreate,
  runTaskGet,
  runTaskList,
  runTaskUpdate,
} from "./task-board.js";
import { runScheduleCreate, runScheduleList, runScheduleRemove, SCHEDULER_TOOLS } from "./scheduler.js";
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
import {
  SECURITY_TOOLS,
  runSecurityApprove,
  runSecurityCheck,
  runSecurityListApprovals,
  runSecurityReject,
  runSecurityReloadPolicy,
  runSecurityRequestApproval,
} from "./security.js";
import { TODO_TOOLS, runTodo } from "./todo.js";
import {
  WORKTREE_TOOLS,
  runWorktreeCloseout,
  runWorktreeCreate,
  runWorktreeEnter,
  runWorktreeKeep,
  runWorktreeList,
  runWorktreeRemove,
  runWorktreeRun,
} from "./worktree.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

const REPLAY_SAFE_TOOLS = new Set([
  "read_file",
  "memory_search",
  "memory_list",
  "task_list",
  "task_get",
  "estimate_tokens",
  "security_check",
  "security_list_approvals",
  "worktree_list",
  "team_list_teammates",
  "team_read_inbox",
  "team_list_requests",
  "check_background",
]);

export const BASE_UNKNOWN_TOOL = JSON.stringify({
  ok: false,
  error: { code: "UNKNOWN_TOOL", message: "未知工具" },
});

const COMPACT_RUNTIME_CONTEXT = new AsyncLocalStorage<CompactRuntimeContext>();

const BASE_HANDLERS: Record<string, ToolHandler> = {
  bash: async (args) => runBash(String(args.command ?? "")),
  read_file: async (args) => runReadFile(args.path, args.limit),
  write_file: async (args) => runWriteFile(args.path, args.content),
  edit_file: async (args) => runEditFile(args.path, args.old_text, args.new_text),
  delivery_validate: async (args) => DEFAULT_DELIVERY_SERVICE.runValidateTool(args.changed_paths, args.mode),
  delivery_report: async () => DEFAULT_DELIVERY_SERVICE.runReportTool(),
  memory_add: async (args) =>
    DEFAULT_MEMORY_SERVICE.runAdd(args.source, args.type, args.tags, args.content, args.confidence),
  memory_search: async (args) => DEFAULT_MEMORY_SERVICE.runSearch(args.query, args.limit, args.layer, args.type),
  memory_list: async (args) => DEFAULT_MEMORY_SERVICE.runList(args.layer, args.limit),
  todo: async (args) => runTodo(args.items),
  task_create: async (args) => runTaskCreate(args.subject, args.description),
  task_update: async (args) =>
    runTaskUpdate(
      args.task_id,
      args.status,
      args.addBlockedBy,
      args.removeBlockedBy,
      args.worktree,
      args.worktree_state,
      args.last_worktree,
      args.closeout,
    ),
  task_list: async () => runTaskList(),
  task_get: async (args) => runTaskGet(args.task_id),
  schedule_create: async (args) => runScheduleCreate(args.cron, args.prompt, args.recurring, args.durable),
  schedule_list: async () => runScheduleList(),
  schedule_remove: async (args) => runScheduleRemove(args.id),
  estimate_tokens: async () => runEstimateTokens(COMPACT_RUNTIME_CONTEXT.getStore()),
  compact: async (args) => runCompact(args.keep_recent, COMPACT_RUNTIME_CONTEXT.getStore()),
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
  security_check: async (args) => runSecurityCheck(args.tool, args.args_json),
  security_request_approval: async (args) => runSecurityRequestApproval(args.tool, args.args_json),
  security_approve: async (args) => runSecurityApprove(args.request_id),
  security_reject: async (args) => runSecurityReject(args.request_id),
  security_list_approvals: async (args) => runSecurityListApprovals(args.status),
  security_reload_policy: async () => runSecurityReloadPolicy(),
  worktree_create: async (args) => runWorktreeCreate(args.name),
  worktree_list: async () => runWorktreeList(),
  worktree_enter: async (args) => runWorktreeEnter(args.name, args.task_id),
  worktree_run: async (args) => runWorktreeRun(args.name, args.command),
  worktree_keep: async (args) => runWorktreeKeep(args.name, args.task_id),
  worktree_remove: async (args) => runWorktreeRemove(args.name, args.force, args.task_id),
  worktree_closeout: async (args) => runWorktreeCloseout(args.name, args.action, args.force, args.task_id),
  autonomy_set_owner: async (args) => runAutonomySetOwner(args.owner),
  autonomy_status: async () => runAutonomyStatus(),
  autonomy_tick: async () => runAutonomyTick(),
  autonomy_mark_active: async () => runAutonomyMarkActive(),
};

export const BASE_TOOLS: ChatCompletionTool[] = [
  ...BASH_TOOLS,
  ...FILE_TOOLS,
  {
    type: "function",
    function: {
      name: "delivery_validate",
      description: "Run the centralized delivery validation pipeline and persist a delivery report.",
      parameters: {
        type: "object",
        properties: {
          changed_paths: {
            type: "array",
            items: { type: "string" },
          },
          mode: {
            type: "string",
            enum: ["manual", "auto"],
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delivery_report",
      description: "Read the most recent delivery report from disk.",
      parameters: { type: "object", properties: {} },
    },
  },
  ...MEMORY_TOOLS,
  ...TODO_TOOLS,
  ...TASK_TOOLS,
  ...SCHEDULER_TOOLS,
  ...CONTEXT_TOOLS,
  ...BACKGROUND_TOOLS,
  ...TEAM_TOOLS,
  ...SECURITY_TOOLS,
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

export async function withCompactRuntimeContext<T>(context: CompactRuntimeContext, fn: () => Promise<T>): Promise<T> {
  return COMPACT_RUNTIME_CONTEXT.run(context, fn);
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

export function resolveBaseToolHandler(
  name: string,
): { handler: ToolHandler; allowDuringReplay: boolean } | null {
  const handler = BASE_HANDLERS[name];
  if (!handler) {
    return null;
  }
  return {
    handler,
    allowDuringReplay: REPLAY_SAFE_TOOLS.has(name),
  };
}

export async function runBaseToolByName(name: string, argumentsJson: string): Promise<string> {
  const resolved = resolveBaseToolHandler(name);
  if (!resolved) {
    return BASE_UNKNOWN_TOOL;
  }
  const args = parseToolArgs(argumentsJson);
  return executeProtectedToolHandler({
    name,
    args,
    handler: resolved.handler,
    allowDuringReplay: resolved.allowDuringReplay,
  });
}
