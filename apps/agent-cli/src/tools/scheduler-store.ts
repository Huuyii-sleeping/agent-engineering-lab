import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ScheduleRecord, ScheduleRunRecord, ScheduledPromptNotification } from "./scheduler-types.js";
import { toTimestampMs } from "./scheduler-types.js";

type Paths = {
  root: string;
  recordsPath: string;
  notificationsPath: string;
  historyPath: string;
  lockPath: string;
};

type SchedulerLockRecord = {
  owner: string;
  pid: number;
  acquiredAt: number;
  expiresAt: number;
};

export class SchedulerStore {
  private initRoot: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly rootResolver: () => string = () => path.join(process.cwd(), ".schedule")) {}

  private paths(): Paths {
    const root = this.rootResolver();
    return {
      root,
      recordsPath: path.join(root, "records.json"),
      notificationsPath: path.join(root, "notifications.json"),
      historyPath: path.join(root, "history.json"),
      lockPath: path.join(root, "lock.json"),
    };
  }

  private async ensureFile(filePath: string, defaultContent: string): Promise<void> {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await writeFile(filePath, defaultContent, "utf8");
    }
  }

  async ensureInit(): Promise<void> {
    const paths = this.paths();
    if (this.initRoot !== paths.root) {
      this.initRoot = paths.root;
      this.initPromise = (async () => {
        await mkdir(paths.root, { recursive: true });
        await this.ensureFile(paths.recordsPath, "[]\n");
        await this.ensureFile(paths.notificationsPath, "[]\n");
        await this.ensureFile(paths.historyPath, "[]\n");
      })();
    }
    await this.initPromise;
  }

  async loadRecords(): Promise<ScheduleRecord[]> {
    await this.ensureInit();
    const raw = await readFile(this.paths().recordsPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<ScheduleRecord>>;
    return parsed.map((item) => {
      const lastFiredAt = toTimestampMs(item.last_fired_at, null);
      const lastRunAt = toTimestampMs(item.last_run_at, lastFiredAt);
      const enabled = item.enabled !== false && item.status !== "disabled";
      return {
        id: String(item.id ?? ""),
        cron: String(item.cron ?? ""),
        kind: item.kind === "once" ? "once" : "cron",
        once_at: toTimestampMs(item.once_at, null),
        prompt: String(item.prompt ?? ""),
        recurring: item.recurring !== false,
        durable: item.durable !== false,
        created_at: toTimestampMs(item.created_at, 0) ?? 0,
        last_fired_at: lastFiredAt,
        last_run_at: lastRunAt,
        next_run_at: toTimestampMs(item.next_run_at, null),
        last_error: typeof item.last_error === "string" ? item.last_error : null,
        run_count: typeof item.run_count === "number" && Number.isFinite(item.run_count)
          ? Math.max(0, Math.trunc(item.run_count))
          : lastRunAt === null ? 0 : 1,
        status: enabled ? "enabled" : "disabled",
        enabled,
        lease_owner: typeof item.lease_owner === "string" && item.lease_owner.trim()
          ? item.lease_owner
          : null,
        lease_until: toTimestampMs(item.lease_until, null),
      };
    });
  }

  async saveRecords(records: ScheduleRecord[]): Promise<void> {
    await this.ensureInit();
    await writeFile(this.paths().recordsPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  async loadNotifications(): Promise<ScheduledPromptNotification[]> {
    await this.ensureInit();
    const raw = await readFile(this.paths().notificationsPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<ScheduledPromptNotification>>;
    return parsed.map((item) => ({
      id: String(item.id ?? ""),
      scheduleId: String(item.scheduleId ?? ""),
      prompt: String(item.prompt ?? ""),
      recurring: item.recurring !== false,
      firedAt: toTimestampMs(item.firedAt, 0) ?? 0,
    }));
  }

  async saveNotifications(notifications: ScheduledPromptNotification[]): Promise<void> {
    await this.ensureInit();
    await writeFile(this.paths().notificationsPath, `${JSON.stringify(notifications, null, 2)}\n`, "utf8");
  }

  async loadHistory(): Promise<ScheduleRunRecord[]> {
    await this.ensureInit();
    const raw = await readFile(this.paths().historyPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<ScheduleRunRecord>>;
    return parsed.map((item) => ({
      id: String(item.id ?? ""),
      scheduleId: String(item.scheduleId ?? ""),
      prompt: String(item.prompt ?? ""),
      status: item.status === "failed" || item.status === "skipped" ? item.status : "fired",
      startedAt: toTimestampMs(item.startedAt, 0) ?? 0,
      finishedAt: toTimestampMs(item.finishedAt, 0) ?? 0,
      error: typeof item.error === "string" ? item.error : null,
    }));
  }

  async saveHistory(history: ScheduleRunRecord[], limit = 200): Promise<void> {
    await this.ensureInit();
    const trimmed = history.slice(Math.max(0, history.length - limit));
    await writeFile(this.paths().historyPath, `${JSON.stringify(trimmed, null, 2)}\n`, "utf8");
  }

  async acquireTickLock(owner: string, nowMs: number, ttlMs: number): Promise<{ acquired: boolean; lock: SchedulerLockRecord | null }> {
    await this.ensureInit();
    const paths = this.paths();
    const current = await this.readLock();
    if (current && current.expiresAt > nowMs && current.owner !== owner) {
      return { acquired: false, lock: current };
    }
    const lock: SchedulerLockRecord = {
      owner,
      pid: process.pid,
      acquiredAt: nowMs,
      expiresAt: nowMs + ttlMs,
    };
    await writeFile(paths.lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    const verified = await this.readLock();
    return { acquired: verified?.owner === owner, lock: verified };
  }

  async releaseTickLock(owner: string): Promise<void> {
    await this.ensureInit();
    const current = await this.readLock();
    if (current?.owner === owner) {
      await rm(this.paths().lockPath, { force: true });
    }
  }

  private async readLock(): Promise<SchedulerLockRecord | null> {
    try {
      const raw = await readFile(this.paths().lockPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<SchedulerLockRecord>;
      if (typeof parsed.owner !== "string" || typeof parsed.expiresAt !== "number") {
        return null;
      }
      return {
        owner: parsed.owner,
        pid: typeof parsed.pid === "number" ? parsed.pid : 0,
        acquiredAt: toTimestampMs(parsed.acquiredAt, 0) ?? 0,
        expiresAt: toTimestampMs(parsed.expiresAt, 0) ?? 0,
      };
    } catch {
      return null;
    }
  }
}
