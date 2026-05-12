import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { SchedulerManager, setSchedulerNowProvider } from "./scheduler-manager.js";
import type { ScheduledPromptNotification, TickResult } from "./scheduler-types.js";
export type { ScheduleRecord, ScheduledPromptNotification, TickResult } from "./scheduler-types.js";
export { SchedulerManager, setSchedulerNowProvider };

const SCHEDULER = new SchedulerManager();

function toJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export const SCHEDULER_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "schedule_create",
      description:
        "Create a durable future prompt schedule. Supports 6-field cron (second minute hour day month weekday) and 5-field cron (minute hour day month weekday, defaults second=0). Example: every 3 seconds => */3 * * * * *.",
      parameters: {
        type: "object",
        properties: {
          cron: { type: "string" },
          prompt: { type: "string" },
          recurring: { type: "boolean" },
          durable: { type: "boolean" },
        },
        required: ["cron", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_list",
      description: "List existing future prompt schedules with timestamp fields in milliseconds.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_remove",
      description: "Remove a future prompt schedule by id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
];

export async function runScheduleCreate(
  cron: unknown,
  prompt: unknown,
  recurring: unknown,
  durable: unknown,
): Promise<string> {
  return toJson(await SCHEDULER.createSchedule(cron, prompt, recurring, durable));
}

export async function runScheduleList(): Promise<string> {
  return toJson({ ok: true, schedules: await SCHEDULER.listSchedules() });
}

export async function runScheduleRemove(id: unknown): Promise<string> {
  return toJson(await SCHEDULER.removeSchedule(id));
}

export async function tickScheduler(nowArg?: Date): Promise<TickResult> {
  return SCHEDULER.tick(nowArg);
}

export async function drainScheduledNotifications(): Promise<ScheduledPromptNotification[]> {
  return SCHEDULER.drainNotifications();
}

export async function peekScheduledNotificationCount(): Promise<number> {
  return SCHEDULER.peekNotificationCount();
}
