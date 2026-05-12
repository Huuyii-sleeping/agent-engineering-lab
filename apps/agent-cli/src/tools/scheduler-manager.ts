import { cronMatches, isCronValid, secondKey } from "./scheduler-cron.js";
import { SchedulerStore } from "./scheduler-store.js";
import type { ScheduleRecord, ScheduledPromptNotification, TickResult } from "./scheduler-types.js";

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

let nowProvider: () => Date = () => new Date();

export function setSchedulerNowProvider(provider: (() => Date) | null): void {
  nowProvider = provider ?? (() => new Date());
}

export class SchedulerManager {
  private readonly store: SchedulerStore;

  constructor(storeOrRootResolver: SchedulerStore | (() => string) = new SchedulerStore()) {
    this.store = storeOrRootResolver instanceof SchedulerStore
      ? storeOrRootResolver
      : new SchedulerStore(storeOrRootResolver);
  }

  async createSchedule(
    cronArg: unknown,
    promptArg: unknown,
    recurringArg: unknown,
    durableArg: unknown,
  ): Promise<{ ok: true; schedule: ScheduleRecord } | { ok: false; error: { code: string; message: string } }> {
    const cron = String(cronArg ?? "").trim();
    const prompt = String(promptArg ?? "").trim();
    const recurring = recurringArg === undefined ? false : Boolean(recurringArg);
    const durable = durableArg === undefined ? true : Boolean(durableArg);
    if (!cron) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_create requires cron" } };
    }
    if (!isCronValid(cron)) {
      return {
        ok: false,
        error: { code: "INVALID_CRON", message: "cron must be a valid 5-field or 6-field expression" },
      };
    }
    if (!prompt) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_create requires prompt" } };
    }
    const records = await this.store.loadRecords();
    const schedule: ScheduleRecord = {
      id: makeId("sch"),
      cron,
      prompt,
      recurring,
      durable,
      created_at: nowProvider().getTime(),
      last_fired_at: null,
      enabled: true,
    };
    records.push(schedule);
    await this.store.saveRecords(records);
    return { ok: true, schedule };
  }

  async listSchedules(): Promise<ScheduleRecord[]> {
    return this.store.loadRecords();
  }

  async removeSchedule(idArg: unknown): Promise<{ ok: true; removed: number } | { ok: false; error: { code: string; message: string } }> {
    const id = String(idArg ?? "").trim();
    if (!id) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_remove requires id" } };
    }
    const records = await this.store.loadRecords();
    const notifications = await this.store.loadNotifications();
    const filteredRecords = records.filter((item) => item.id !== id);
    if (filteredRecords.length === records.length) {
      return { ok: false, error: { code: "SCHEDULE_NOT_FOUND", message: `schedule ${id} not found` } };
    }
    await this.store.saveRecords(filteredRecords);
    await this.store.saveNotifications(notifications.filter((item) => item.scheduleId !== id));
    return { ok: true, removed: records.length - filteredRecords.length };
  }

  async tick(nowArg?: Date): Promise<TickResult> {
    const now = nowArg ?? nowProvider();
    const currentSecond = secondKey(now);
    const records = await this.store.loadRecords();
    const notifications = await this.store.loadNotifications();
    const fired: ScheduledPromptNotification[] = [];

    for (const record of records) {
      if (!record.enabled || !cronMatches(record.cron, now)) {
        continue;
      }
      const lastFiredSecond = record.last_fired_at ? secondKey(new Date(record.last_fired_at)) : null;
      if (lastFiredSecond === currentSecond) {
        continue;
      }

      const firedAt = now.getTime();
      const notification: ScheduledPromptNotification = {
        id: makeId("sched_evt"),
        scheduleId: record.id,
        prompt: record.prompt,
        recurring: record.recurring,
        firedAt,
      };
      notifications.push(notification);
      fired.push(notification);
      record.last_fired_at = firedAt;
      if (!record.recurring) {
        record.enabled = false;
      }
    }

    if (fired.length > 0) {
      await this.store.saveRecords(records);
      await this.store.saveNotifications(notifications);
    }

    return {
      scannedAt: now.getTime(),
      fired,
    };
  }

  async drainNotifications(): Promise<ScheduledPromptNotification[]> {
    const notifications = await this.store.loadNotifications();
    await this.store.saveNotifications([]);
    return notifications;
  }

  async peekNotificationCount(): Promise<number> {
    return (await this.store.loadNotifications()).length;
  }
}
