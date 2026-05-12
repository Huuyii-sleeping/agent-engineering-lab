import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { WorktreeManager } from "./worktree-manager.js";

const WORKTREES = new WorktreeManager();

export const WORKTREE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "worktree_create",
      description: "Create a worktree (or workdir fallback) by name.",
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
      name: "worktree_list",
      description: "List worktree records.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_enter",
      description: "Mark a worktree as the active execution lane and optionally sync a task binding.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          task_id: { type: "integer" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_run",
      description: "Run a command inside a worktree path.",
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
      name: "worktree_keep",
      description: "Close out a worktree by keeping it.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          task_id: { type: "integer" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_remove",
      description: "Close out a worktree by removing it; force can override dirty git guard.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          force: { type: "boolean" },
          task_id: { type: "integer" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worktree_closeout",
      description: "Close out a worktree with action keep or remove and sync task/worktree lifecycle state.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          action: { type: "string", enum: ["keep", "remove"] },
          force: { type: "boolean" },
          task_id: { type: "integer" },
        },
        required: ["name", "action"],
      },
    },
  },
];

export async function runWorktreeCreate(name: unknown): Promise<string> {
  return WORKTREES.create(name);
}

export async function runWorktreeList(): Promise<string> {
  return WORKTREES.list();
}

export async function runWorktreeEnter(name: unknown, taskId?: unknown): Promise<string> {
  return WORKTREES.enter(name, taskId);
}

export async function runWorktreeRun(name: unknown, command: unknown): Promise<string> {
  return WORKTREES.run(name, command);
}

export async function runWorktreeKeep(name: unknown, taskId?: unknown): Promise<string> {
  return WORKTREES.keep(name, taskId);
}

export async function runWorktreeRemove(name: unknown, force?: unknown, taskId?: unknown): Promise<string> {
  return WORKTREES.remove(name, force, taskId);
}

export async function runWorktreeCloseout(name: unknown, action: unknown, force?: unknown, taskId?: unknown): Promise<string> {
  return WORKTREES.closeout(name, action, taskId, force);
}
