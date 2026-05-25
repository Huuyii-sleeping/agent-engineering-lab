export type ScheduleKind = "cron" | "once";

export type ScheduleStatus = "enabled" | "disabled";

export type ScheduleRunStatus = "fired" | "skipped" | "failed";

export type ScheduleRecord = {
  id: string;
  cron: string;
  kind: ScheduleKind;
  once_at: number | null;
  prompt: string;
  recurring: boolean;
  durable: boolean;
  created_at: number;
  last_fired_at: number | null;
  last_run_at: number | null;
  next_run_at: number | null;
  last_error: string | null;
  run_count: number;
  status: ScheduleStatus;
  enabled: boolean;
};

export type ScheduleRunRecord = {
  id: string;
  scheduleId: string;
  prompt: string;
  status: ScheduleRunStatus;
  startedAt: number;
  finishedAt: number;
  error: string | null;
};

export type ScheduledPromptNotification = {
  id: string;
  scheduleId: string;
  prompt: string;
  recurring: boolean;
  firedAt: number;
};

export type TickResult = {
  scannedAt: number;
  fired: ScheduledPromptNotification[];
  locked?: boolean;
};

export function toTimestampMs(value: unknown, fallback: number | null): number | null {
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
