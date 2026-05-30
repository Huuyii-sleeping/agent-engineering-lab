import { cronMatches, findNextCronRun, isCronValid, secondKey } from "./scheduler-cron.js";
import { SchedulerStore } from "./scheduler-store.js";
import type {
  ScheduleExplainResult,
  ScheduleRecord,
  ScheduleRunRecord,
  ScheduledPromptNotification,
  TickResult,
} from "./scheduler-types.js";
import { toTimestampMs } from "./scheduler-types.js";

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

let nowProvider: () => Date = () => new Date();

export function setSchedulerNowProvider(provider: (() => Date) | null): void {
  nowProvider = provider ?? (() => new Date());
}

type CreateScheduleOptions = {
  delayMs?: unknown;
  onceAt?: unknown;
  now?: Date;
};

function scheduleEnabled(record: ScheduleRecord): boolean {
  return record.enabled && record.status !== "disabled";
}

function disableSchedule(record: ScheduleRecord): void {
  record.enabled = false;
  record.status = "disabled";
  record.next_run_at = null;
}

function computeNextRunAt(record: ScheduleRecord, now: Date): number | null {
  if (record.kind === "once") {
    if (record.once_at === null || !scheduleEnabled(record)) {
      return null;
    }
    return record.once_at >= now.getTime() ? record.once_at : null;
  }
  return findNextCronRun(record.cron, now)?.getTime() ?? null;
}

function scheduleMatches(record: ScheduleRecord, now: Date, scannedAt: number): boolean {
  return record.kind === "once"
    ? record.once_at !== null && record.once_at <= scannedAt
    : cronMatches(record.cron, now);
}

function leaseActiveForOtherOwner(record: ScheduleRecord, owner: string, nowMs: number): boolean {
  return record.lease_owner !== null
    && record.lease_owner !== owner
    && record.lease_until !== null
    && record.lease_until > nowMs;
}

export class SchedulerManager {
  private readonly store: SchedulerStore;
  private readonly lockOwner = makeId("scheduler_owner");
  private readonly lockTtlMs = 10_000;
  private readonly scheduleLeaseTtlMs = 30_000;

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
    options: CreateScheduleOptions = {},
  ): Promise<{ ok: true; schedule: ScheduleRecord } | { ok: false; error: { code: string; message: string } }> {
    const cron = String(cronArg ?? "").trim();
    const prompt = String(promptArg ?? "").trim();
    const recurring = recurringArg === undefined ? false : Boolean(recurringArg);
    const durable = durableArg === undefined ? true : Boolean(durableArg);
    if (!prompt) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_create requires prompt" } };
    }
    const now = options.now ?? nowProvider();
    const delayMs = options.delayMs === undefined ? null : Number(options.delayMs);
    const explicitOnceAt = toTimestampMs(options.onceAt, null);
    const hasDelay = delayMs !== null && Number.isFinite(delayMs);
    if ((delayMs !== null && !hasDelay) || (hasDelay && delayMs < 0)) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "delay_ms must be a non-negative number" } };
    }
    const onceAt = hasDelay ? now.getTime() + Math.trunc(delayMs) : explicitOnceAt;
    if (onceAt === null && !cron) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_create requires cron, once_at, or delay_ms" } };
    }
    if (onceAt === null && !isCronValid(cron)) {
      return {
        ok: false,
        error: { code: "INVALID_CRON", message: "cron must be a valid 5-field or 6-field expression" },
      };
    }
    const records = await this.store.loadRecords();
    const schedule: ScheduleRecord = {
      id: makeId("sch"),
      cron: onceAt === null ? cron : "",
      kind: onceAt === null ? "cron" : "once",
      once_at: onceAt,
      prompt,
      recurring: onceAt === null ? recurring : false,
      durable,
      created_at: now.getTime(),
      last_fired_at: null,
      last_run_at: null,
      next_run_at: onceAt ?? findNextCronRun(cron, now)?.getTime() ?? null,
      last_error: null,
      run_count: 0,
      status: "enabled",
      enabled: true,
      lease_owner: null,
      lease_until: null,
    };
    records.push(schedule);
    await this.store.saveRecords(records);
    return { ok: true, schedule };
  }

  async listSchedules(): Promise<ScheduleRecord[]> {
    return this.store.loadRecords();
  }

  async listScheduleState(): Promise<{ schedules: ScheduleRecord[]; history: ScheduleRunRecord[] }> {
    return {
      schedules: await this.store.loadRecords(),
      history: await this.store.loadHistory(),
    };
  }

  async explainSchedule(idArg: unknown, nowArg?: Date): Promise<ScheduleExplainResult> {
    const id = String(idArg ?? "").trim();
    if (!id) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_explain requires id" } };
    }
    const now = nowArg ?? nowProvider();
    const scannedAt = now.getTime();
    const records = await this.store.loadRecords();
    const record = records.find((item) => item.id === id);
    if (!record) {
      return { ok: false, error: { code: "SCHEDULE_NOT_FOUND", message: `schedule ${id} not found` } };
    }
    const history = (await this.store.loadHistory())
      .filter((item) => item.scheduleId === record.id)
      .slice(-10);
    const due = scheduleEnabled(record) && scheduleMatches(record, now, scannedAt);
    const leaseActive = record.lease_owner !== null && record.lease_until !== null && record.lease_until > scannedAt;
    const lastFiredSecond = record.last_fired_at ? secondKey(new Date(record.last_fired_at)) : null;
    const alreadyFiredThisSecond = lastFiredSecond === secondKey(now);
    return {
      ok: true,
      schedule: {
        id: record.id,
        status: record.status,
        kind: record.kind,
        enabled: record.enabled,
        recurring: record.recurring,
        cron: record.cron,
        once_at: record.once_at,
      },
      due,
      next_run_at: record.next_run_at,
      last_run_at: record.last_run_at,
      run_count: record.run_count,
      last_error: record.last_error,
      lease: {
        owner: record.lease_owner,
        until: record.lease_until,
        active: leaseActive,
      },
      recent_history: history,
      reason: this.explainReason(record, due, leaseActive, alreadyFiredThisSecond, scannedAt),
    };
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
    const scannedAt = now.getTime();
    const lock = await this.store.acquireTickLock(this.lockOwner, scannedAt, this.lockTtlMs);
    if (!lock.acquired) {
      return {
        scannedAt,
        fired: [],
        locked: true,
      };
    }
    try {
      const currentSecond = secondKey(now);
      const records = await this.store.loadRecords();
      const notifications = await this.store.loadNotifications();
      const fired: ScheduledPromptNotification[] = [];
      const history = await this.store.loadHistory();

      for (const record of records) {
        if (!scheduleEnabled(record)) {
          continue;
        }
        const matched = scheduleMatches(record, now, scannedAt);
        if (!matched) {
          record.next_run_at = computeNextRunAt(record, now);
          continue;
        }
        const lastFiredSecond = record.last_fired_at ? secondKey(new Date(record.last_fired_at)) : null;
        if (lastFiredSecond === currentSecond) {
          continue;
        }
        if (leaseActiveForOtherOwner(record, this.lockOwner, scannedAt)) {
          continue;
        }

        const firedAt = now.getTime();
        record.lease_owner = this.lockOwner;
        record.lease_until = firedAt + this.scheduleLeaseTtlMs;
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
        record.last_run_at = firedAt;
        record.last_error = null;
        record.run_count += 1;
        history.push({
          id: makeId("sched_run"),
          scheduleId: record.id,
          prompt: record.prompt,
          status: "fired",
          startedAt: firedAt,
          finishedAt: firedAt,
          error: null,
        });
        if (!record.recurring) {
          disableSchedule(record);
        } else {
          record.next_run_at = computeNextRunAt(record, now);
        }
        record.lease_owner = null;
        record.lease_until = null;
      }

      if (fired.length > 0) {
        await this.store.saveRecords(records);
        await this.store.saveNotifications(notifications);
        await this.store.saveHistory(history);
      }

      return {
        scannedAt,
        fired,
      };
    } finally {
      await this.store.releaseTickLock(this.lockOwner);
    }
  }

  async drainNotifications(): Promise<ScheduledPromptNotification[]> {
    const notifications = await this.store.loadNotifications();
    await this.store.saveNotifications([]);
    return notifications;
  }

  async peekNotificationCount(): Promise<number> {
    return (await this.store.loadNotifications()).length;
  }

  private explainReason(
    record: ScheduleRecord,
    due: boolean,
    leaseActive: boolean,
    alreadyFiredThisSecond: boolean,
    nowMs: number,
  ): string {
    if (!scheduleEnabled(record)) {
      return "schedule is disabled and will not fire";
    }
    if (leaseActive && record.lease_owner !== this.lockOwner) {
      return `schedule is blocked by active lease owner ${record.lease_owner} until ${record.lease_until}`;
    }
    if (leaseActive) {
      return `schedule is currently claimed by this scheduler owner until ${record.lease_until}`;
    }
    if (record.lease_owner !== null && record.lease_until !== null && record.lease_until <= nowMs) {
      return `schedule has a stale lease from owner ${record.lease_owner} and can be recovered`;
    }
    if (alreadyFiredThisSecond) {
      return "schedule already fired in this second and duplicate firing is suppressed";
    }
    if (due) {
      return "schedule is due now and eligible to fire";
    }
    if (record.next_run_at !== null) {
      return `schedule is not due yet; next_run_at is ${record.next_run_at}`;
    }
    return "schedule is enabled but has no next run time";
  }
}
