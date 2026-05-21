import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { TaskManager } from "./task-manager.js";

const TASKS = new TaskManager();

export const TASK_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "task_create",
      description: "Create a task.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string" },
          description: { type: "string" },
        },
        required: ["subject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_update",
      description: "Update task status/dependencies/worktree.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          addBlockedBy: { type: "array", items: { type: "integer" } },
          removeBlockedBy: { type: "array", items: { type: "integer" } },
          worktree: { type: "string" },
          worktree_state: { type: "string", enum: ["none", "bound", "entered", "running", "kept", "removed"] },
          last_worktree: { type: "string" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_claim",
      description: "Claim a task for a coordinator, teammate, or subagent owner.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
          owner: { type: "string" },
        },
        required: ["task_id", "owner"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_list",
      description: "List task summary.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "task_get",
      description: "Get task by id.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "integer" } },
        required: ["task_id"],
      },
    },
  },
];

export async function runTaskCreate(subject: unknown, description: unknown): Promise<string> {
  return TASKS.create(subject, description);
}

export async function runTaskUpdate(
  taskId: unknown,
  status: unknown,
  addBlockedBy: unknown,
  removeBlockedBy: unknown,
  worktree?: unknown,
  worktreeState?: unknown,
  lastWorktree?: unknown,
  closeout?: unknown,
): Promise<string> {
  return TASKS.update(taskId, status, addBlockedBy, removeBlockedBy, worktree, worktreeState, lastWorktree, closeout);
}

export async function runTaskList(): Promise<string> {
  return TASKS.listAll();
}

export async function runTaskGet(taskId: unknown): Promise<string> {
  return TASKS.get(taskId);
}

export async function runScanUnclaimedTasks(): Promise<string> {
  return TASKS.scanUnclaimedTasks();
}

export async function runClaimTask(taskId: unknown, owner: unknown): Promise<string> {
  return TASKS.claimTask(taskId, owner);
}

export async function runTaskSyncWorktreeState(
  worktreeName: unknown,
  worktreeState: unknown,
  taskId?: unknown,
  closeout?: unknown,
): Promise<string> {
  return TASKS.syncWorktreeState(worktreeName, worktreeState, taskId, closeout);
}
