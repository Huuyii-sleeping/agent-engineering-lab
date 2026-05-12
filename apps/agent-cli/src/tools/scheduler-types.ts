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

export type TickResult = {
  scannedAt: number;
  fired: ScheduledPromptNotification[];
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
