import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ScheduleRecord, ScheduledPromptNotification } from "./scheduler-types.js";
import { toTimestampMs } from "./scheduler-types.js";

type Paths = {
  root: string;
  recordsPath: string;
  notificationsPath: string;
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
      })();
    }
    await this.initPromise;
  }

  async loadRecords(): Promise<ScheduleRecord[]> {
    await this.ensureInit();
    const raw = await readFile(this.paths().recordsPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<ScheduleRecord>>;
    return parsed.map((item) => ({
      id: String(item.id ?? ""),
      cron: String(item.cron ?? ""),
      prompt: String(item.prompt ?? ""),
      recurring: item.recurring !== false,
      durable: item.durable !== false,
      created_at: toTimestampMs(item.created_at, 0) ?? 0,
      last_fired_at: toTimestampMs(item.last_fired_at, null),
      enabled: item.enabled !== false,
    }));
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
}
