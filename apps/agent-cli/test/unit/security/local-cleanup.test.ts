import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { readAuditEvents } from "../../../src/audit/runtime.js";
import { readObservabilityEvents, recordObservabilityEvent } from "../../../src/observability/runtime.js";
import { cleanupLocalRetention } from "../../../src/security/local-cleanup.js";
import { retentionDaysFor } from "../../../src/security/local-retention.js";

const DAY_MS = 24 * 60 * 60 * 1000;

let tempDir = "";
let previousCwd = "";

async function enterWorkspace(): Promise<void> {
  tempDir = path.join(tmpdir(), `local-cleanup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  previousCwd = process.cwd();
  process.chdir(tempDir);
}

async function readJsonLines(filePath: string): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(async () => {
  if (previousCwd) {
    process.chdir(previousCwd);
    previousCwd = "";
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("security/local-cleanup", () => {
  it("prunes expired audit rows, keeps active rows, returns counts, and audits cleanup", async () => {
    await enterWorkspace();
    const now = Date.UTC(2026, 0, 1);
    const auditRoot = path.join(tempDir, ".audit");
    await mkdir(auditRoot, { recursive: true });
    await writeFile(
      path.join(auditRoot, "events.jsonl"),
      [
        JSON.stringify({
          schemaVersion: 1,
          id: "expired",
          at: now - 100,
          expiresAt: now - 1,
          category: "tool",
          action: "execute",
          outcome: "completed",
          subject: "old-tool",
          summary: "old",
          sessionId: null,
          traceId: null,
          metadata: {},
        }),
        JSON.stringify({
          schemaVersion: 1,
          id: "active",
          at: now,
          expiresAt: now + DAY_MS,
          category: "tool",
          action: "execute",
          outcome: "completed",
          subject: "new-tool",
          summary: "new",
          sessionId: null,
          traceId: null,
          metadata: {},
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    const summary = await cleanupLocalRetention({ now });
    const rows = await readJsonLines(path.join(auditRoot, "events.jsonl"));
    const auditEvents = await readAuditEvents({ category: "retention" });

    expect(summary.artifacts.audit_event).toMatchObject({
      scanned: 2,
      kept: 1,
      deleted: 1,
      skipped: 0,
    });
    expect(rows.map((row) => row.id)).toEqual(["active", expect.stringMatching(/^aud_/)]);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      category: "retention",
      action: "local_retention_cleanup",
      outcome: "completed",
    });
  });

  it("adds expiresAt to new observability events and prunes legacy expired observability rows", async () => {
    await enterWorkspace();
    const now = Date.UTC(2026, 0, 1);
    const observabilityRoot = path.join(tempDir, ".observability");
    await mkdir(observabilityRoot, { recursive: true });
    await writeFile(
      path.join(observabilityRoot, "events.jsonl"),
      [
        JSON.stringify({
          schemaVersion: 1,
          id: "legacy-expired",
          at: now - (retentionDaysFor("observability_event") + 1) * DAY_MS,
          trace_id: "trace-old",
          span_id: null,
          kind: "tool_result",
          payload: {},
        }),
        JSON.stringify({
          schemaVersion: 1,
          id: "legacy-active",
          at: now - DAY_MS,
          trace_id: "trace-new",
          span_id: null,
          kind: "tool_result",
          payload: {},
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    const summary = await cleanupLocalRetention({ now });
    const rows = await readJsonLines(path.join(observabilityRoot, "events.jsonl"));

    expect(summary.artifacts.observability_event).toMatchObject({
      scanned: 2,
      kept: 1,
      deleted: 1,
      skipped: 0,
    });
    expect(rows.map((row) => row.id)).toEqual(["legacy-active"]);

    await recordObservabilityEvent("tool_result", { toolName: "read_file", ok: true });
    const events = await readObservabilityEvents();
    expect(events.at(-1)?.expiresAt).toEqual(expect.any(Number));
  });

  it("prunes expired secret findings and keeps active findings", async () => {
    await enterWorkspace();
    const now = Date.UTC(2026, 0, 1);
    const securityRoot = path.join(tempDir, ".security");
    await mkdir(securityRoot, { recursive: true });
    await writeFile(
      path.join(securityRoot, "secret-findings.json"),
      JSON.stringify(
        [
          {
            schemaVersion: 1,
            id: "expired",
            createdAt: now - (retentionDaysFor("security_record") + 1) * DAY_MS,
            sourceKind: "workspace_write",
            targetPath: "old.txt",
            ruleId: "secret-hint",
            action: "audit_only",
            severity: "low",
            summary: "old",
            preview: "old",
            fingerprint: "old",
          },
          {
            schemaVersion: 1,
            id: "active",
            createdAt: now - DAY_MS,
            sourceKind: "workspace_write",
            targetPath: "new.txt",
            ruleId: "secret-hint",
            action: "audit_only",
            severity: "low",
            summary: "new",
            preview: "new",
            fingerprint: "new",
          },
        ],
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const summary = await cleanupLocalRetention({ now });
    const findings = JSON.parse(await readFile(path.join(securityRoot, "secret-findings.json"), "utf8")) as Array<{
      id: string;
    }>;

    expect(summary.artifacts.security_record).toMatchObject({
      scanned: 2,
      kept: 1,
      deleted: 1,
      skipped: 0,
    });
    expect(findings.map((item) => item.id)).toEqual(["active"]);
  });

  it("does not create runtime artifacts when local persistence is disabled", async () => {
    const previous = process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
    process.env.AGENT_PRIVACY_PERSISTENCE_MODE = "disabled";
    try {
      await enterWorkspace();

      const summary = await cleanupLocalRetention();

      expect(summary.enabled).toBe(false);
      expect(summary.total).toMatchObject({
        scanned: 0,
        kept: 0,
        deleted: 0,
        skipped: 0,
      });
      await expect(readFile(path.join(tempDir, ".audit", "events.jsonl"), "utf8")).rejects.toBeTruthy();
      await expect(readFile(path.join(tempDir, ".observability", "events.jsonl"), "utf8")).rejects.toBeTruthy();
      await expect(readFile(path.join(tempDir, ".security", "secret-findings.json"), "utf8")).rejects.toBeTruthy();
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
      } else {
        process.env.AGENT_PRIVACY_PERSISTENCE_MODE = previous;
      }
    }
  });
});
