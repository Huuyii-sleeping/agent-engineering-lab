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
        "Create a durable future prompt schedule. Use delay_ms or once_at for one-shot reminders; use 6-field cron (second minute hour day month weekday) or 5-field cron (minute hour day month weekday, defaults second=0) for cron schedules.",
      parameters: {
        type: "object",
        properties: {
          cron: { type: "string" },
          once_at: {
            type: "number",
            description: "Absolute one-shot reminder time in Unix epoch milliseconds.",
          },
          delay_ms: {
            type: "number",
            description: "Relative one-shot reminder delay in milliseconds. Prefer this for requests like 'in 5 seconds'.",
          },
          prompt: { type: "string" },
          recurring: { type: "boolean" },
          durable: { type: "boolean" },
          misfire_policy: {
            type: "string",
            enum: ["fire_once", "skip", "catch_up"],
            description: "Cron misfire behavior. Defaults to fire_once.",
          },
          max_catch_up: {
            type: "number",
            description: "Maximum catch-up notifications for catch_up misfires. Clamped to 1..20.",
          },
        },
        required: ["prompt"],
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
  {
    type: "function",
    function: {
      name: "schedule_explain",
      description:
        "Explain why a future prompt schedule is or is not firing, including due status, lease state, timestamps, last error, and recent history.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_pause",
      description: "Pause a future prompt schedule so it will not fire until resumed.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_resume",
      description: "Resume a paused future prompt schedule and recompute its next run time.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_update",
      description: "Update prompt, cron, recurring, misfire policy, or catch-up limit for a schedule.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          prompt: { type: "string" },
          cron: { type: "string" },
          recurring: { type: "boolean" },
          misfire_policy: { type: "string", enum: ["fire_once", "skip", "catch_up"] },
          max_catch_up: { type: "number" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_stats",
      description: "Return production scheduler counts for schedules, notifications, history, leases, overdue items, and last tick metadata.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export async function runScheduleCreate(
  cron: unknown,
  prompt: unknown,
  recurring: unknown,
  durable: unknown,
  onceAt?: unknown,
  delayMs?: unknown,
  misfirePolicy?: unknown,
  maxCatchUp?: unknown,
): Promise<string> {
  return toJson(await SCHEDULER.createSchedule(cron, prompt, recurring, durable, {
    onceAt,
    delayMs,
    misfirePolicy,
    maxCatchUp,
  }));
}

export async function runScheduleList(): Promise<string> {
  return toJson({ ok: true, ...(await SCHEDULER.listScheduleState()) });
}

export async function runScheduleRemove(id: unknown): Promise<string> {
  return toJson(await SCHEDULER.removeSchedule(id));
}

export async function runScheduleExplain(id: unknown): Promise<string> {
  return toJson(await SCHEDULER.explainSchedule(id));
}

export async function runSchedulePause(id: unknown): Promise<string> {
  return toJson(await SCHEDULER.pauseSchedule(id));
}

export async function runScheduleResume(id: unknown): Promise<string> {
  return toJson(await SCHEDULER.resumeSchedule(id));
}

export async function runScheduleUpdate(
  id: unknown,
  prompt: unknown,
  cron: unknown,
  recurring: unknown,
  misfirePolicy: unknown,
  maxCatchUp: unknown,
): Promise<string> {
  return toJson(await SCHEDULER.updateSchedule(id, {
    prompt,
    cron,
    recurring,
    misfire_policy: misfirePolicy,
    max_catch_up: maxCatchUp,
  }));
}

export async function runScheduleStats(): Promise<string> {
  return toJson(await SCHEDULER.getStats());
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
