import { RUNTIME_CONFIG } from "../runtime-config.js";

export type LocalArtifactKind =
  | "session"
  | "transcript_snapshot"
  | "prompt_dump"
  | "observability_event"
  | "security_record"
  | "audit_event";

export type LocalRetentionClass =
  | "protected_runtime_state"
  | "protected_snapshot"
  | "operational_telemetry"
  | "security_audit";

export type CleanupTrigger = "on_write" | "on_read" | "on_startup" | "on_delivery_validation" | "manual";

export type LocalArtifactContract = {
  retentionClass: LocalRetentionClass;
  retentionDays: number;
  cleanupTriggers: CleanupTrigger[];
  auditEventType: "retention_cleanup" | "artifact_export" | "artifact_delete";
  exportMode: "protected_export" | "query_only";
  deleteMode: "explicit_delete" | "ttl_only";
};

export type LocalArtifactMetadata = {
  schemaVersion: 1;
  kind: LocalArtifactKind;
  createdAt: number;
  expiresAt: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const LOCAL_ARTIFACT_CONTRACTS: Record<LocalArtifactKind, LocalArtifactContract> = {
  session: {
    retentionClass: "protected_runtime_state",
    retentionDays: RUNTIME_CONFIG.sessionRetentionDays,
    cleanupTriggers: ["on_write", "on_read", "on_startup", "manual"],
    auditEventType: "retention_cleanup",
    exportMode: "protected_export",
    deleteMode: "explicit_delete",
  },
  transcript_snapshot: {
    retentionClass: "protected_snapshot",
    retentionDays: RUNTIME_CONFIG.transcriptRetentionDays,
    cleanupTriggers: ["on_write", "on_read", "manual"],
    auditEventType: "retention_cleanup",
    exportMode: "protected_export",
    deleteMode: "explicit_delete",
  },
  prompt_dump: {
    retentionClass: "protected_snapshot",
    retentionDays: RUNTIME_CONFIG.promptDumpRetentionDays,
    cleanupTriggers: ["on_write", "on_read", "manual"],
    auditEventType: "artifact_export",
    exportMode: "protected_export",
    deleteMode: "explicit_delete",
  },
  observability_event: {
    retentionClass: "operational_telemetry",
    retentionDays: 14,
    cleanupTriggers: ["on_write", "on_startup", "manual"],
    auditEventType: "retention_cleanup",
    exportMode: "query_only",
    deleteMode: "explicit_delete",
  },
  security_record: {
    retentionClass: "security_audit",
    retentionDays: 30,
    cleanupTriggers: ["on_write", "on_startup", "on_delivery_validation", "manual"],
    auditEventType: "artifact_export",
    exportMode: "protected_export",
    deleteMode: "explicit_delete",
  },
  audit_event: {
    retentionClass: "security_audit",
    retentionDays: 30,
    cleanupTriggers: ["on_write", "on_startup", "on_delivery_validation", "manual"],
    auditEventType: "artifact_delete",
    exportMode: "protected_export",
    deleteMode: "explicit_delete",
  },
};

export function retentionDaysFor(kind: LocalArtifactKind): number {
  return LOCAL_ARTIFACT_CONTRACTS[kind].retentionDays;
}

export function buildArtifactMetadata(
  kind: LocalArtifactKind,
  createdAt = Date.now(),
): LocalArtifactMetadata {
  return {
    schemaVersion: 1,
    kind,
    createdAt,
    expiresAt: createdAt + retentionDaysFor(kind) * DAY_MS,
  };
}

export function isExpired(expiresAt: number | null | undefined, now = Date.now()): boolean {
  return typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt <= now;
}
