import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { recordAuditEvent } from "../audit/runtime.js";
import { isLocalPersistenceEnabled } from "../runtime-config.js";
import { parseTimestampMs } from "../time.js";
import {
  buildArtifactMetadata,
  isExpired,
  retentionDaysFor,
  type LocalArtifactKind,
} from "./local-retention.js";

type CleanupArtifactKind = "audit_event" | "observability_event" | "security_record";

/** Counts produced while pruning one known local artifact file. */
export type LocalCleanupArtifactSummary = {
  scanned: number;
  kept: number;
  deleted: number;
  skipped: number;
};

/** Summary returned by a local retention cleanup run. */
export type LocalCleanupSummary = {
  schemaVersion: 1;
  enabled: boolean;
  at: number;
  artifacts: Record<CleanupArtifactKind, LocalCleanupArtifactSummary>;
  total: LocalCleanupArtifactSummary;
};

/** Options for running local retention cleanup. */
export type LocalCleanupOptions = {
  root?: string;
  now?: number;
};

const EMPTY_ARTIFACT_SUMMARY: LocalCleanupArtifactSummary = {
  scanned: 0,
  kept: 0,
  deleted: 0,
  skipped: 0,
};

function emptyArtifactSummary(): LocalCleanupArtifactSummary {
  return { ...EMPTY_ARTIFACT_SUMMARY };
}

function emptySummary(now: number, enabled: boolean): LocalCleanupSummary {
  return {
    schemaVersion: 1,
    enabled,
    at: now,
    artifacts: {
      audit_event: emptyArtifactSummary(),
      observability_event: emptyArtifactSummary(),
      security_record: emptyArtifactSummary(),
    },
    total: emptyArtifactSummary(),
  };
}

function addSummary(total: LocalCleanupArtifactSummary, item: LocalCleanupArtifactSummary): void {
  total.scanned += item.scanned;
  total.kept += item.kept;
  total.deleted += item.deleted;
  total.skipped += item.skipped;
}

function expiryFromRecord(
  record: Record<string, unknown>,
  kind: LocalArtifactKind,
  timestampKey: "at" | "createdAt",
): number {
  const expiresAt = parseTimestampMs(record.expiresAt, 0);
  if (expiresAt > 0) {
    return expiresAt;
  }
  const createdAt = parseTimestampMs(record[timestampKey], 0);
  if (createdAt <= 0) {
    return 0;
  }
  return createdAt + retentionDaysFor(kind) * 24 * 60 * 60 * 1000;
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  return readFile(filePath, "utf8").catch(() => null);
}

async function pruneJsonl(input: {
  filePath: string;
  kind: LocalArtifactKind;
  timestampKey: "at" | "createdAt";
  now: number;
}): Promise<LocalCleanupArtifactSummary> {
  const summary = emptyArtifactSummary();
  const raw = await readTextIfExists(input.filePath);
  if (raw === null || !raw.trim()) {
    return summary;
  }

  const kept: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    summary.scanned += 1;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      const expiresAt = expiryFromRecord(record, input.kind, input.timestampKey);
      if (expiresAt <= 0) {
        summary.skipped += 1;
        continue;
      }
      if (isExpired(expiresAt, input.now)) {
        summary.deleted += 1;
        continue;
      }
      summary.kept += 1;
      kept.push(JSON.stringify(record));
    } catch {
      summary.skipped += 1;
    }
  }

  await writeFile(input.filePath, kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf8");
  return summary;
}

async function pruneSecretFindings(filePath: string, now: number): Promise<LocalCleanupArtifactSummary> {
  const summary = emptyArtifactSummary();
  const raw = await readTextIfExists(filePath);
  if (raw === null || !raw.trim()) {
    return summary;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    summary.skipped += 1;
    return summary;
  }
  if (!Array.isArray(parsed)) {
    summary.skipped += 1;
    return summary;
  }

  const kept: unknown[] = [];
  for (const item of parsed) {
    summary.scanned += 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      summary.skipped += 1;
      continue;
    }
    const finding = item as Record<string, unknown>;
    const expiresAt = expiryFromRecord(finding, "security_record", "createdAt");
    if (expiresAt <= 0) {
      summary.skipped += 1;
      continue;
    }
    if (isExpired(expiresAt, now)) {
      summary.deleted += 1;
      continue;
    }
    summary.kept += 1;
    kept.push(finding);
  }

  await writeFile(filePath, `${JSON.stringify(kept, null, 2)}\n`, "utf8");
  return summary;
}

/** Prune expired rows from the known local audit, observability, and security artifact files. */
export async function cleanupLocalRetention(options: LocalCleanupOptions = {}): Promise<LocalCleanupSummary> {
  const now = options.now ?? Date.now();
  if (!isLocalPersistenceEnabled()) {
    return emptySummary(now, false);
  }

  const root = options.root ?? process.cwd();
  const summary = emptySummary(now, true);
  summary.artifacts.audit_event = await pruneJsonl({
    filePath: path.join(root, ".audit", "events.jsonl"),
    kind: "audit_event",
    timestampKey: "at",
    now,
  });
  summary.artifacts.observability_event = await pruneJsonl({
    filePath: path.join(root, ".observability", "events.jsonl"),
    kind: "observability_event",
    timestampKey: "at",
    now,
  });
  summary.artifacts.security_record = await pruneSecretFindings(
    path.join(root, ".security", "secret-findings.json"),
    now,
  );
  for (const item of Object.values(summary.artifacts)) {
    addSummary(summary.total, item);
  }

  await recordAuditEvent(
    {
      category: "retention",
      action: "local_retention_cleanup",
      outcome: "completed",
      subject: "local-runtime-artifacts",
      summary: "local retention cleanup completed",
      metadata: {
        at: summary.at,
        artifacts: summary.artifacts,
        total: summary.total,
      },
    },
    {
      auditRoot: path.join(root, ".audit"),
    },
  );
  return summary;
}

/** Build retention metadata for a new observability event. */
export function buildObservabilityRetentionMetadata(createdAt: number): { expiresAt: number } {
  return {
    expiresAt: buildArtifactMetadata("observability_event", createdAt).expiresAt,
  };
}
