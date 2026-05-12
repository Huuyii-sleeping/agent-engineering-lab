type CronFields = [string, string, string, string, string, string];

export function secondKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

export function parseCron(cron: string): CronFields | null {
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

export function cronMatches(cron: string, now: Date): boolean {
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

export function isCronValid(cron: string): boolean {
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
