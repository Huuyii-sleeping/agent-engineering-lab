export type ScheduleKind = "cron" | "once";

export type ScheduleStatus = "enabled" | "disabled";

export type ScheduleRunStatus = "fired" | "skipped" | "failed";

export type ScheduleMisfirePolicy = "fire_once" | "skip" | "catch_up";

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
  lease_owner: string | null;
  lease_until: number | null;
  misfire_policy: ScheduleMisfirePolicy;
  max_catch_up: number;
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

export type ScheduleExplainResult =
  | {
      ok: true;
      schedule: {
        id: string;
        status: ScheduleStatus;
        kind: ScheduleKind;
        enabled: boolean;
        recurring: boolean;
        cron: string;
        once_at: number | null;
        misfire_policy: ScheduleMisfirePolicy;
        max_catch_up: number;
      };
      due: boolean;
      next_run_at: number | null;
      last_run_at: number | null;
      run_count: number;
      last_error: string | null;
      lease: {
        owner: string | null;
        until: number | null;
        active: boolean;
      };
      recent_history: ScheduleRunRecord[];
      reason: string;
    }
  | {
      ok: false;
      error: { code: string; message: string };
    };

export type TickResult = {
  scannedAt: number;
  fired: ScheduledPromptNotification[];
  locked?: boolean;
};

export const DEFAULT_MISFIRE_POLICY: ScheduleMisfirePolicy = "fire_once";
export const DEFAULT_MAX_CATCH_UP = 5;
export const MIN_MAX_CATCH_UP = 1;
export const MAX_MAX_CATCH_UP = 20;

export function normalizeMisfirePolicy(value: unknown): ScheduleMisfirePolicy {
  return value === "skip" || value === "catch_up" || value === "fire_once"
    ? value
    : DEFAULT_MISFIRE_POLICY;
}

export function normalizeMaxCatchUp(value: unknown): number {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  const numeric = Number.isFinite(parsed) ? Math.trunc(parsed) : DEFAULT_MAX_CATCH_UP;
  return Math.min(MAX_MAX_CATCH_UP, Math.max(MIN_MAX_CATCH_UP, numeric));
}

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
