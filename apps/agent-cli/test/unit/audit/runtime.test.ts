import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { readAuditEvents, recordAuditEvent } from "../../../src/audit/runtime.js";

let tempDir = "";
let previousCwd = "";

async function withWorkspace(): Promise<void> {
  tempDir = await mkdtemp(path.join(tmpdir(), "audit-runtime-test-"));
  previousCwd = process.cwd();
  process.chdir(tempDir);
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

describe("audit/runtime", () => {
  it("persists append-only redacted audit events", async () => {
    await withWorkspace();

    await recordAuditEvent({
      category: "tool",
      action: "execute",
      outcome: "blocked",
      subject: "write_file",
      summary: "token=sk-123456789012345678901234\u200b",
      sessionId: "session_1",
      traceId: "trace_1",
      metadata: {
        authorization: "Bearer hidden-secret-token",
      },
    });
    await recordAuditEvent({
      category: "session",
      action: "chat",
      outcome: "completed",
      subject: "session_2",
      summary: "completed",
      sessionId: "session_2",
    });

    const raw = await readFile(path.join(tempDir, ".audit", "events.jsonl"), "utf8");
    const lines = raw.trim().split(/\r?\n/);
    const events = await readAuditEvents();

    expect(lines).toHaveLength(2);
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      category: "tool",
      action: "execute",
      outcome: "blocked",
      subject: "write_file",
      sessionId: "session_1",
      traceId: "trace_1",
    });
    expect(raw).toContain("[REDACTED_SECRET]");
    expect(raw).toContain("Bearer [REDACTED_TOKEN]");
    expect(raw).not.toContain("sk-123456789012345678901234");
    expect(raw).not.toContain("\u200b");
  });

  it("supports bounded local queries by session trace and category", async () => {
    await withWorkspace();

    await recordAuditEvent({
      category: "session",
      action: "chat",
      outcome: "started",
      subject: "session_a",
      summary: "started",
      sessionId: "session_a",
      traceId: "trace_a",
    });
    await recordAuditEvent({
      category: "tool",
      action: "execute",
      outcome: "completed",
      subject: "read_file",
      summary: "completed",
      sessionId: "session_a",
      traceId: "trace_a",
    });
    await recordAuditEvent({
      category: "session",
      action: "chat",
      outcome: "completed",
      subject: "session_b",
      summary: "completed",
      sessionId: "session_b",
      traceId: "trace_b",
    });

    await expect(readAuditEvents({ sessionId: "session_a" })).resolves.toHaveLength(2);
    await expect(readAuditEvents({ traceId: "trace_b" })).resolves.toHaveLength(1);
    await expect(readAuditEvents({ category: "tool" })).resolves.toMatchObject([
      { category: "tool", subject: "read_file" },
    ]);
    await expect(readAuditEvents({ limit: 1 })).resolves.toMatchObject([
      { category: "session", sessionId: "session_b" },
    ]);
  });

  it("does not write audit events when local persistence is disabled", async () => {
    const previous = process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
    process.env.AGENT_PRIVACY_PERSISTENCE_MODE = "disabled";
    try {
      await withWorkspace();

      await recordAuditEvent({
        category: "session",
        action: "chat",
        outcome: "started",
        subject: "session_disabled",
        summary: "started",
      });

      await expect(readFile(path.join(tempDir, ".audit", "events.jsonl"), "utf8")).rejects.toBeTruthy();
      await expect(readAuditEvents()).resolves.toEqual([]);
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
      } else {
        process.env.AGENT_PRIVACY_PERSISTENCE_MODE = previous;
      }
    }
  });
});
