import { vi } from "vitest";

const renameOutcomes: Array<"fail"> = [];

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (renameOutcomes.shift() === "fail") {
        const error = new Error("busy") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }
      return actual.rename(...args);
    },
  };
});

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentSessionRecord,
  summarizeSessionTranscript,
  type AgentSessionRecord,
} from "../../../src/service-api/sessions.js";
import { SessionStore } from "../../../src/service-api/session-store.js";

let tempDir = "";

afterEach(async () => {
  vi.restoreAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    tempDir = "";
  }
});

describe("service-api/session-store", () => {
  it("persists and reloads session records", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-session-store-"));
    const store = new SessionStore(path.join(tempDir, ".sessions"));
    const session = createAgentSessionRecord("session_1", 1000);
    session.history.push({ role: "user", content: "hello daemon" });
    session.rounds = 3;
    session.memoryBinding = {
      ownerId: "owner-1",
      resourceId: "resource-1",
      title: "Thread 1",
      metadata: { source: "test" },
    };
    session.runtimeBinding = {
      backend: "mastra",
      adapterVersion: "mastra-agent-v1",
      runtimeVersion: "1.52.1",
      selectionReason: "explicit canary",
    };

    await store.save(session);

    const loaded = await store.load(session.id);
    const list = await store.list();

    expect(loaded).not.toBeNull();
    expect((loaded as AgentSessionRecord).id).toBe("session_1");
    expect(summarizeSessionTranscript(loaded as AgentSessionRecord)).toMatchObject({
      id: "session_1",
      createdAt: 1000,
      updatedAt: 1000,
      messages: [{ role: "user", content: "hello daemon" }],
    });
    expect(list.map((item) => item.id)).toEqual(["session_1"]);
    expect(list[0]?.rounds).toBe(3);
    expect(loaded?.memoryBinding).toEqual({
      ownerId: "owner-1",
      resourceId: "resource-1",
      title: "Thread 1",
      metadata: { source: "test" },
    });
    expect(loaded?.runtimeBinding).toEqual({
      backend: "mastra",
      adapterVersion: "mastra-agent-v1",
      runtimeVersion: "1.52.1",
      selectionReason: "explicit canary",
    });
  });

  it("appends session journal rows on every save", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-session-store-"));
    const store = new SessionStore(path.join(tempDir, ".sessions"));
    const session = createAgentSessionRecord("session_journal", 1000);
    session.history.push({ role: "user", content: "first" });

    await store.save(session);

    session.updatedAt = 2000;
    session.history.push({ role: "assistant", content: "second" });
    await store.save(session);

    const raw = await readFile(path.join(tempDir, ".sessions", "session_session_journal.jsonl"), "utf8");
    const rows = raw.trim().split("\n").map((line) => JSON.parse(line) as { session: AgentSessionRecord });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.session.history).toHaveLength(1);
    expect(rows[1]?.session.history).toHaveLength(2);
  });

  it("restores sessions from journal when the snapshot is absent", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-session-store-"));
    const store = new SessionStore(path.join(tempDir, ".sessions"));
    const session = createAgentSessionRecord("session_resume", 1000);
    session.history.push({ role: "user", content: "before restart" });
    session.rounds = 4;

    await store.save(session);
    await rm(path.join(tempDir, ".sessions", "session_session_resume.json"), { force: true });

    const loaded = await store.load(session.id);

    expect(loaded?.history).toEqual([{ role: "user", content: "before restart" }]);
    expect(loaded?.rounds).toBe(4);
  });

  it("prefers journal data over stale snapshots while listing sessions", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-session-store-"));
    const store = new SessionStore(path.join(tempDir, ".sessions"));
    const session = createAgentSessionRecord("session_prefer_journal", 1000);
    const snapshotPath = path.join(tempDir, ".sessions", "session_session_prefer_journal.json");
    session.history.push({ role: "user", content: "stale snapshot" });

    await store.save(session);
    const staleSnapshot = await readFile(snapshotPath, "utf8");
    session.history.push({ role: "assistant", content: "journal wins" });
    await store.save(session);
    await writeFile(snapshotPath, staleSnapshot, "utf8");

    const listed = await store.list();

    expect(listed.map((item) => item.id)).toEqual(["session_prefer_journal"]);
    expect(listed[0]?.history).toEqual([
      { role: "user", content: "stale snapshot" },
      { role: "assistant", content: "journal wins" },
    ]);
  });

  it("redacts secret-like session history and metadata before persistence", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-session-store-"));
    const store = new SessionStore(path.join(tempDir, ".sessions"));
    const session = createAgentSessionRecord("session_secret", 1000);
    session.history.push({ role: "user", content: "token=sk-12345678901234567890" });
    session.memoryBinding = {
      ownerId: "owner-1",
      resourceId: "resource-1",
      metadata: { note: "password=hunter2" },
    };

    await store.save(session);

    const raw = await readFile(path.join(tempDir, ".sessions", "session_session_secret.json"), "utf8");
    expect(raw).toContain("[REDACTED_SECRET]");
    expect(raw).not.toContain("sk-12345678901234567890");
    expect(raw).not.toContain("hunter2");
  });

  it("retries transient rename failures while replacing an existing session file", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-session-store-"));
    const store = new SessionStore(path.join(tempDir, ".sessions"));
    const session = createAgentSessionRecord("session_retry", 1000);

    await store.save(session);

    renameOutcomes.push("fail");

    session.updatedAt = 2000;
    await store.save(session);

    const loaded = await store.load(session.id);
    expect(loaded?.updatedAt).toBe(2000);
  });

  it("does not persist session files when no-persistence mode is enabled", async () => {
    const previous = process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
    process.env.AGENT_PRIVACY_PERSISTENCE_MODE = "disabled";
    try {
      tempDir = await mkdtemp(path.join(tmpdir(), "agent-session-store-"));
      const store = new SessionStore(path.join(tempDir, ".sessions"));
      const session = createAgentSessionRecord("session_private", 1000);

      await store.save(session);

      await expect(readFile(path.join(tempDir, ".sessions", "session_session_private.json"), "utf8")).rejects.toBeTruthy();
      await expect(readFile(path.join(tempDir, ".sessions", "session_session_private.jsonl"), "utf8")).rejects.toBeTruthy();
      expect(await store.list()).toEqual([]);
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
      } else {
        process.env.AGENT_PRIVACY_PERSISTENCE_MODE = previous;
      }
    }
  });

  it("deletes both legacy snapshots and session journals", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-session-store-"));
    const store = new SessionStore(path.join(tempDir, ".sessions"));
    const session = createAgentSessionRecord("session_delete", 1000);

    await store.save(session);

    expect(await store.delete(session.id)).toBe(true);
    await expect(readFile(path.join(tempDir, ".sessions", "session_session_delete.json"), "utf8")).rejects.toBeTruthy();
    await expect(readFile(path.join(tempDir, ".sessions", "session_session_delete.jsonl"), "utf8")).rejects.toBeTruthy();
  });
});
