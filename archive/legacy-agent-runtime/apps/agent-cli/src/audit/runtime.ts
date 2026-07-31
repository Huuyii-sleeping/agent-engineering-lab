import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { isLocalPersistenceEnabled } from "../runtime-config.js";
import { sanitizeAndRedactValue } from "../security/data-hygiene.js";
import { buildArtifactMetadata, isExpired } from "../security/local-retention.js";
import { nowTimestampMs, parseTimestampMs } from "../time.js";

export type AuditCategory = "session" | "tool" | "security" | "retention";

export type AuditOutcome =
  | "started"
  | "completed"
  | "failed"
  | "blocked"
  | "created"
  | "consumed"
  | "denied"
  | "succeeded";

export type AuditEvent = {
  schemaVersion: 1;
  id: string;
  at: number;
  expiresAt: number;
  category: AuditCategory;
  action: string;
  outcome: AuditOutcome;
  subject: string;
  summary: string;
  sessionId: string | null;
  traceId: string | null;
  metadata: Record<string, unknown>;
};

export type AuditEventInput = {
  category: AuditCategory;
  action: string;
  outcome: AuditOutcome;
  subject: string;
  summary: string;
  sessionId?: string | null;
  traceId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditQuery = {
  limit?: number;
  sessionId?: string;
  traceId?: string;
  category?: AuditCategory;
};

type AuditWriteOptions = {
  auditRoot?: string;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1_000;

function makeAuditId(): string {
  return `aud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function paths(root = process.cwd()): { root: string; eventsPath: string } {
  const auditRoot = path.join(root, ".audit");
  return pathsForAuditRoot(auditRoot);
}

function pathsForAuditRoot(auditRoot: string): { root: string; eventsPath: string } {
  return {
    root: auditRoot,
    eventsPath: path.join(auditRoot, "events.jsonl"),
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isInteger(limit) || (limit ?? 0) <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
}

function redactRecord<T extends Record<string, unknown>>(value: T): T {
  return sanitizeAndRedactValue(value) as T;
}

function normalizeEvent(input: Partial<AuditEvent>): AuditEvent | null {
  const category = input.category;
  if (category !== "session" && category !== "tool" && category !== "security" && category !== "retention") {
    return null;
  }
  const outcome = input.outcome;
  if (
    outcome !== "started" &&
    outcome !== "completed" &&
    outcome !== "failed" &&
    outcome !== "blocked" &&
    outcome !== "created" &&
    outcome !== "consumed" &&
    outcome !== "denied" &&
    outcome !== "succeeded"
  ) {
    return null;
  }
  const normalized: AuditEvent = {
    schemaVersion: 1,
    id: String(input.id ?? ""),
    at: parseTimestampMs(input.at, 0),
    expiresAt: parseTimestampMs(input.expiresAt, 0),
    category,
    action: String(input.action ?? ""),
    outcome,
    subject: String(input.subject ?? ""),
    summary: String(input.summary ?? ""),
    sessionId: typeof input.sessionId === "string" ? input.sessionId : null,
    traceId: typeof input.traceId === "string" ? input.traceId : null,
    metadata:
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, unknown>)
        : {},
  };
  return normalized.id && normalized.action && normalized.subject ? normalized : null;
}

export async function recordAuditEvent(input: AuditEventInput, options: AuditWriteOptions = {}): Promise<AuditEvent> {
  const metadata = buildArtifactMetadata("audit_event");
  const event = redactRecord({
    schemaVersion: 1,
    id: makeAuditId(),
    at: nowTimestampMs(),
    expiresAt: metadata.expiresAt,
    category: input.category,
    action: input.action,
    outcome: input.outcome,
    subject: input.subject,
    summary: input.summary,
    sessionId: input.sessionId ?? null,
    traceId: input.traceId ?? null,
    metadata: input.metadata ?? {},
  }) as AuditEvent;
  if (!isLocalPersistenceEnabled()) {
    return event;
  }
  const target = options.auditRoot ? pathsForAuditRoot(options.auditRoot) : paths();
  await mkdir(target.root, { recursive: true });
  await appendFile(target.eventsPath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function readAuditEvents(query: AuditQuery = {}): Promise<AuditEvent[]> {
  if (!isLocalPersistenceEnabled()) {
    return [];
  }
  const raw = await readFile(paths().eventsPath, "utf8").catch(() => "");
  if (!raw.trim()) {
    return [];
  }
  const events: AuditEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const event = normalizeEvent(JSON.parse(line) as Partial<AuditEvent>);
      if (event && !isExpired(event.expiresAt)) {
        events.push(event);
      }
    } catch {
      // Ignore malformed audit rows so one bad line does not hide later valid events.
    }
  }
  const filtered = events.filter((event) => {
    if (query.sessionId && event.sessionId !== query.sessionId) {
      return false;
    }
    if (query.traceId && event.traceId !== query.traceId) {
      return false;
    }
    if (query.category && event.category !== query.category) {
      return false;
    }
    return true;
  });
  return filtered.slice(-normalizeLimit(query.limit));
}
