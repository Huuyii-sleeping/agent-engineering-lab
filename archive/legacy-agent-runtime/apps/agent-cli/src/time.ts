export function nowTimestampMs(): number {
  return Date.now();
}

export function parseTimestampMs(value: unknown, fallback: number): number {
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

export function parseOptionalTimestampMs(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return parseTimestampMs(value, 0);
}

export function plusSecondsMs(timestampMs: number, seconds: number): number {
  return timestampMs + seconds * 1000;
}
