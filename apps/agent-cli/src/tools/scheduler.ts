import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export type ScheduleRecord = {
  id: string;
  cron: string;
  prompt: string;
  recurring: boolean;
  durable: boolean;
  created_at: number;
  last_fired_at: number | null;
  enabled: boolean;
};

export type ScheduledPromptNotification = {
  id: string;
  scheduleId: string;
  prompt: string;
  recurring: boolean;
  firedAt: number;
};

type Paths = {
  root: string;
  recordsPath: string;
  notificationsPath: string;
};

type CronFields = [string, string, string, string, string, string];

type TickResult = {
  scannedAt: number;
  fired: ScheduledPromptNotification[];
};

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function secondKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}:${sec}`;
}

function parseCron(cron: string): CronFields | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length === 5) {
    return ["0", parts[0], parts[1], parts[2], parts[3], parts[4]];
  }
  if (parts.length !== 6) {
    return null;
  }
  return [parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]];
}

function validateRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function parseNumberToken(token: string, min: number, max: number): number | null {
  const value = Number(token);
  return validateRange(value, min, max) ? value : null;
}

function expandToken(token: string, min: number, max: number): number[] | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "*") {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }
  if (/^\*\/\d+$/.test(trimmed)) {
    const step = Number(trimmed.slice(2));
    if (!validateRange(step, 1, max - min + 1)) {
      return null;
    }
    const out: number[] = [];
    for (let value = min; value <= max; value += step) {
      out.push(value);
    }
    return out;
  }
  const stepMatch = /^(\d+)-(\d+)\/(\d+)$/.exec(trimmed);
  if (stepMatch) {
    const start = parseNumberToken(stepMatch[1], min, max);
    const end = parseNumberToken(stepMatch[2], min, max);
    const step = Number(stepMatch[3]);
    if (start === null || end === null || start > end || !validateRange(step, 1, max - min + 1)) {
      return null;
    }
    const out: number[] = [];
    for (let value = start; value <= end; value += step) {
      out.push(value);
    }
    return out;
  }
  const rangeMatch = /^(\d+)-(\d+)$/.exec(trimmed);
  if (rangeMatch) {
    const start = parseNumberToken(rangeMatch[1], min, max);
    const end = parseNumberToken(rangeMatch[2], min, max);
    if (start === null || end === null || start > end) {
      return null;
    }
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  const single = parseNumberToken(trimmed, min, max);
  return single === null ? null : [single];
}

function matchField(expr: string, value: number, min: number, max: number): boolean {
  const tokens = expr.split(",");
  const matched = new Set<number>();
  for (const token of tokens) {
    const expanded = expandToken(token, min, max);
    if (!expanded) {
      return false;
    }
    for (const item of expanded) {
      matched.add(item);
    }
  }
  return matched.has(value);
}

function cronMatches(cron: string, now: Date): boolean {
  const fields = parseCron(cron);
  if (!fields) {
    return false;
  }
  const [secondExpr, minuteExpr, hourExpr, dayExpr, monthExpr, weekdayExpr] = fields;
  const weekday = now.getDay();
  return (
    matchField(secondExpr, now.getSeconds(), 0, 59) &&
    matchField(minuteExpr, now.getMinutes(), 0, 59) &&
    matchField(hourExpr, now.getHours(), 0, 23) &&
    matchField(dayExpr, now.getDate(), 1, 31) &&
    matchField(monthExpr, now.getMonth() + 1, 1, 12) &&
    matchField(weekdayExpr, weekday, 0, 6)
  );
}

function isCronValid(cron: string): boolean {
  const fields = parseCron(cron);
  if (!fields) {
    return false;
  }
  return (
    expandToken(fields[0], 0, 59) !== null &&
    expandToken(fields[1], 0, 59) !== null &&
    expandToken(fields[2], 0, 23) !== null &&
    expandToken(fields[3], 1, 31) !== null &&
    expandToken(fields[4], 1, 12) !== null &&
    expandToken(fields[5], 0, 6) !== null
  );
}

function toTimestampMs(value: unknown, fallback: number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.trunc(numeric);
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

let nowProvider: () => Date = () => new Date();

export function setSchedulerNowProvider(provider: (() => Date) | null): void {
  nowProvider = provider ?? (() => new Date());
}

export class SchedulerManager {
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

  private async ensureInit(): Promise<void> {
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

  private async ensureFile(filePath: string, defaultContent: string): Promise<void> {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await writeFile(filePath, defaultContent, "utf8");
    }
  }

  private async loadRecords(): Promise<ScheduleRecord[]> {
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

  private async saveRecords(records: ScheduleRecord[]): Promise<void> {
    await writeFile(this.paths().recordsPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  private async loadNotifications(): Promise<ScheduledPromptNotification[]> {
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

  private async saveNotifications(notifications: ScheduledPromptNotification[]): Promise<void> {
    await writeFile(this.paths().notificationsPath, `${JSON.stringify(notifications, null, 2)}\n`, "utf8");
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
    const records = await this.loadRecords();
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
    await this.saveRecords(records);
    return { ok: true, schedule };
  }

  async listSchedules(): Promise<ScheduleRecord[]> {
    return this.loadRecords();
  }

  async removeSchedule(idArg: unknown): Promise<{ ok: true; removed: number } | { ok: false; error: { code: string; message: string } }> {
    const id = String(idArg ?? "").trim();
    if (!id) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: "schedule_remove requires id" } };
    }
    const records = await this.loadRecords();
    const notifications = await this.loadNotifications();
    const filteredRecords = records.filter((item) => item.id !== id);
    if (filteredRecords.length === records.length) {
      return { ok: false, error: { code: "SCHEDULE_NOT_FOUND", message: `schedule ${id} not found` } };
    }
    await this.saveRecords(filteredRecords);
    await this.saveNotifications(notifications.filter((item) => item.scheduleId !== id));
    return { ok: true, removed: records.length - filteredRecords.length };
  }

  async tick(nowArg?: Date): Promise<TickResult> {
    const now = nowArg ?? nowProvider();
    const currentSecond = secondKey(now);
    const records = await this.loadRecords();
    const notifications = await this.loadNotifications();
    const fired: ScheduledPromptNotification[] = [];

    for (const record of records) {
      if (!record.enabled) {
        continue;
      }
      if (!cronMatches(record.cron, now)) {
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
      await this.saveRecords(records);
      await this.saveNotifications(notifications);
    }

    return {
      scannedAt: now.getTime(),
      fired,
    };
  }

  async drainNotifications(): Promise<ScheduledPromptNotification[]> {
    const notifications = await this.loadNotifications();
    await this.saveNotifications([]);
    return notifications;
  }

  async peekNotificationCount(): Promise<number> {
    return (await this.loadNotifications()).length;
  }
}

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
