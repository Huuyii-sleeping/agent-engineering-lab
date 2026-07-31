import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { BackgroundManager } from "./background-task-manager.js";
import type { BackgroundNotification } from "./background-task-types.js";
export type { BackgroundNotification } from "./background-task-types.js";
export { BackgroundManager };

const BACKGROUND = new BackgroundManager();

export const BACKGROUND_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "background_run",
      description: "Run a shell command in background and return task id immediately.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_background",
      description: "Check background task status; omit task_id to list all tasks.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
        },
      },
    },
  },
];

export async function runBackgroundRun(command: unknown): Promise<string> {
  return BACKGROUND.run(command);
}

export async function runCheckBackground(taskId: unknown): Promise<string> {
  return BACKGROUND.check(taskId);
}

export function drainBackgroundNotifications(): BackgroundNotification[] {
  return BACKGROUND.drainNotifications();
}
