import { cronMatches, findNextCronRun, isCronValid, secondKey } from "./scheduler-cron.js";
import { SchedulerStore } from "./scheduler-store.js";
import type {
  ScheduleExplainResult,
  ScheduleRecord,
  ScheduleRunRecord,
  ScheduledPromptNotification,
  TickResult,
} from "./scheduler-types.js";
import { normalizeMaxCatchUp, normalizeMisfirePolicy, toTimestampMs } from "./scheduler-types.js";

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
  misfirePolicy?: unknown;
  maxCatchUp?: unknown;
};

type ScheduleUpdate = {
  prompt?: unknown;
  cron?: unknown;
  recurring?: unknown;
  misfire_policy?: unknown;
  max_catch_up?: unknown;
};

type ScheduleStatsResult = {
  ok: true;
  schedules: {
    total: number;
    enabled: number;
    disabled: number;
    overdue: number;
    active_leases: number;
  };
  pending_notifications: number;
  history_entries: number;
  last_tick_at: number | null;
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

function effectiveNextRunAt(record: ScheduleRecord, now: Date): number | null {
  if (record.kind === "once") {
    return record.once_at;
  }
  return record.next_run_at ?? computeNextRunAt(record, now);
}

function scheduleMatches(record: ScheduleRecord, now: Date, scannedAt: number): boolean {
  if (record.kind === "once") {
    return record.once_at !== null && record.once_at <= scannedAt;
  }
  const nextRunAt = effectiveNextRunAt(record, now);
  return (nextRunAt !== null && nextRunAt <= scannedAt) || cronMatches(record.cron, now);
}

function nextCronRunAfter(record: ScheduleRecord, timestamp: number): number | null {
  return findNextCronRun(record.cron, new Date(timestamp))?.getTime() ?? null;
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
  private lastTickAt: number | null = null;

  constructor(storeOrRootResolver: SchedulerStore | (() => string) = new SchedulerStore()) {
    this.store = storeOrRootResolver instanceof SchedulerStore
      ? storeOrRootResolver
      : new SchedulerStore(storeOrRootResolver);
  }

  async pauseSchedule(idArg: unknown): Promise<{ ok: true; schedule: ScheduleRecord } | { ok: false; error: { code: string; message: string } }> {
    const id = String(idArg ?? "").trim();
    if (!id) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_pause requires id" } };
    }
    const records = await this.store.loadRecords();
    const record = records.find((item) => item.id === id);
    if (!record) {
      return { ok: false, error: { code: "SCHEDULE_NOT_FOUND", message: `schedule ${id} not found` } };
    }
    disableSchedule(record);
    record.lease_owner = null;
    record.lease_until = null;
    await this.store.saveRecords(records);
    return { ok: true, schedule: record };
  }

  async resumeSchedule(idArg: unknown, nowArg?: Date): Promise<{ ok: true; schedule: ScheduleRecord } | { ok: false; error: { code: string; message: string } }> {
    const id = String(idArg ?? "").trim();
    if (!id) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_resume requires id" } };
    }
    const now = nowArg ?? nowProvider();
    const records = await this.store.loadRecords();
    const record = records.find((item) => item.id === id);
    if (!record) {
      return { ok: false, error: { code: "SCHEDULE_NOT_FOUND", message: `schedule ${id} not found` } };
    }
    record.enabled = true;
    record.status = "enabled";
    record.last_error = null;
    record.lease_owner = null;
    record.lease_until = null;
    record.next_run_at = computeNextRunAt(record, now);
    await this.store.saveRecords(records);
    return { ok: true, schedule: record };
  }

  async updateSchedule(
    idArg: unknown,
    updates: ScheduleUpdate,
    nowArg?: Date,
  ): Promise<{ ok: true; schedule: ScheduleRecord } | { ok: false; error: { code: string; message: string } }> {
    const id = String(idArg ?? "").trim();
    if (!id) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_update requires id" } };
    }
    const now = nowArg ?? nowProvider();
    const records = await this.store.loadRecords();
    const record = records.find((item) => item.id === id);
    if (!record) {
      return { ok: false, error: { code: "SCHEDULE_NOT_FOUND", message: `schedule ${id} not found` } };
    }
    if (updates.prompt !== undefined) {
      const prompt = String(updates.prompt ?? "").trim();
      if (!prompt) {
        return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_update prompt must not be empty" } };
      }
      record.prompt = prompt;
    }
    if (updates.cron !== undefined) {
      const cron = String(updates.cron ?? "").trim();
      if (!isCronValid(cron)) {
        return {
          ok: false,
          error: { code: "INVALID_CRON", message: "cron must be a valid 5-field or 6-field expression" },
        };
      }
      record.kind = "cron";
      record.cron = cron;
      record.once_at = null;
    }
    if (updates.recurring !== undefined) {
      record.recurring = Boolean(updates.recurring);
    }
    if (updates.misfire_policy !== undefined) {
      const policy = normalizeMisfirePolicy(updates.misfire_policy);
      if (policy !== updates.misfire_policy) {
        return {
          ok: false,
          error: { code: "INVALID_ARGUMENT", message: "misfire_policy must be fire_once, skip, or catch_up" },
        };
      }
      record.misfire_policy = policy;
    }
    if (updates.max_catch_up !== undefined) {
      record.max_catch_up = normalizeMaxCatchUp(updates.max_catch_up);
    }
    record.last_error = null;
    record.next_run_at = computeNextRunAt(record, now);
    await this.store.saveRecords(records);
    return { ok: true, schedule: record };
  }

  async getStats(nowArg?: Date): Promise<ScheduleStatsResult> {
    const now = nowArg ?? nowProvider();
    const scannedAt = now.getTime();
    const records = await this.store.loadRecords();
    const notifications = await this.store.loadNotifications();
    const history = await this.store.loadHistory();
    const enabled = records.filter(scheduleEnabled);
    const activeLeases = records.filter(
      (record) => record.lease_owner !== null && record.lease_until !== null && record.lease_until > scannedAt,
    );
    const overdue = enabled.filter((record) => scheduleMatches(record, now, scannedAt));
    const lastTickAt = this.lastTickAt ?? (history.length > 0
      ? Math.max(...history.map((item) => item.finishedAt))
      : null);
    return {
      ok: true,
      schedules: {
        total: records.length,
        enabled: enabled.length,
        disabled: records.length - enabled.length,
        overdue: overdue.length,
        active_leases: activeLeases.length,
      },
      pending_notifications: notifications.length,
      history_entries: history.length,
      last_tick_at: lastTickAt,
    };
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
      misfire_policy: normalizeMisfirePolicy(options.misfirePolicy),
      max_catch_up: normalizeMaxCatchUp(options.maxCatchUp),
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
        misfire_policy: record.misfire_policy,
        max_catch_up: record.max_catch_up,
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
    this.lastTickAt = scannedAt;
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
      let recordsChanged = false;
      let notificationsChanged = false;
      let historyChanged = false;

      for (const record of records) {
        if (!scheduleEnabled(record)) {
          continue;
        }
        if (record.kind === "cron" && record.next_run_at === null) {
          record.next_run_at = computeNextRunAt(record, now);
          recordsChanged = true;
        }
        const matched = scheduleMatches(record, now, scannedAt);
        if (!matched) {
          const nextRunAt = computeNextRunAt(record, now);
          if (record.next_run_at !== nextRunAt) {
            record.next_run_at = nextRunAt;
            recordsChanged = true;
          }
          continue;
        }
        const lastFiredSecond = record.last_fired_at ? secondKey(new Date(record.last_fired_at)) : null;
        if (lastFiredSecond === currentSecond) {
          continue;
        }
        if (leaseActiveForOtherOwner(record, this.lockOwner, scannedAt)) {
          history.push({
            id: makeId("sched_run"),
            scheduleId: record.id,
            prompt: record.prompt,
            status: "skipped",
            startedAt: scannedAt,
            finishedAt: scannedAt,
            error: `skipped due schedule because active lease is held by ${record.lease_owner}`,
          });
          historyChanged = true;
          continue;
        }

        const runTimes = this.dueRunTimes(record, now, scannedAt);
        if (runTimes.length === 0) {
          continue;
        }
        const nextRunAt = effectiveNextRunAt(record, now);
        const isOverdueCron = record.kind === "cron" && nextRunAt !== null && nextRunAt < scannedAt;
        if (isOverdueCron && record.misfire_policy === "skip") {
          const skippedAt = scannedAt;
          history.push({
            id: makeId("sched_run"),
            scheduleId: record.id,
            prompt: record.prompt,
            status: "skipped",
            startedAt: skippedAt,
            finishedAt: skippedAt,
            error: "skipped overdue cron run because misfire_policy=skip",
          });
          record.last_run_at = skippedAt;
          record.last_error = "misfire_policy=skip skipped overdue cron run";
          record.next_run_at = computeNextRunAt(record, now);
          recordsChanged = true;
          historyChanged = true;
          continue;
        }
        record.lease_owner = this.lockOwner;
        record.lease_until = scannedAt + this.scheduleLeaseTtlMs;
        for (const firedAt of runTimes) {
          const notification: ScheduledPromptNotification = {
            id: makeId("sched_evt"),
            scheduleId: record.id,
            prompt: record.prompt,
            recurring: record.recurring,
            firedAt,
          };
          notifications.push(notification);
          fired.push(notification);
          history.push({
            id: makeId("sched_run"),
            scheduleId: record.id,
            prompt: record.prompt,
            status: "fired",
            startedAt: firedAt,
            finishedAt: firedAt,
            error: null,
          });
        }
        const lastRunAt = runTimes[runTimes.length - 1] ?? scannedAt;
        record.last_fired_at = lastRunAt;
        record.last_run_at = lastRunAt;
        record.last_error = null;
        record.run_count += runTimes.length;
        recordsChanged = true;
        notificationsChanged = true;
        historyChanged = true;
        if (!record.recurring) {
          disableSchedule(record);
        } else if (record.kind === "cron" && record.misfire_policy === "catch_up") {
          record.next_run_at = computeNextRunAt(record, now);
        } else {
          record.next_run_at = nextCronRunAfter(record, lastRunAt) ?? computeNextRunAt(record, now);
        }
        record.lease_owner = null;
        record.lease_until = null;
      }

      if (recordsChanged) {
        await this.store.saveRecords(records);
      }
      if (notificationsChanged) {
        await this.store.saveNotifications(notifications);
      }
      if (historyChanged) {
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
      if (record.kind === "cron" && record.next_run_at !== null && record.next_run_at <= nowMs) {
        return `schedule is due because next_run_at ${record.next_run_at} has already arrived; misfire_policy=${record.misfire_policy}`;
      }
      return `schedule is due now and eligible to fire; misfire_policy=${record.misfire_policy}`;
    }
    if (record.next_run_at !== null) {
      return `schedule is not due yet; next_run_at is ${record.next_run_at}`;
    }
    return "schedule is enabled but has no next run time";
  }

  private dueRunTimes(record: ScheduleRecord, now: Date, scannedAt: number): number[] {
    if (record.kind === "once") {
      return record.once_at !== null ? [record.once_at] : [];
    }
    const firstDueAt = effectiveNextRunAt(record, now);
    if (firstDueAt === null) {
      return [];
    }
    if (record.misfire_policy !== "catch_up" || !record.recurring) {
      return [firstDueAt <= scannedAt ? firstDueAt : scannedAt];
    }
    const runTimes: number[] = [];
    let cursor = firstDueAt;
    while (cursor <= scannedAt && runTimes.length < record.max_catch_up) {
      runTimes.push(cursor);
      const next = nextCronRunAfter(record, cursor);
      if (next === null || next <= cursor) {
        break;
      }
      cursor = next;
    }
    return runTimes;
  }
}
