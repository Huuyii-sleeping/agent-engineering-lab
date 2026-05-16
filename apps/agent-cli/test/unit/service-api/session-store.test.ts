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

import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    session.runtimeState.roundCounter = 3;

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
    expect(list[0]?.runtimeState.roundCounter).toBe(3);
  });

  it("redacts secret-like history and runtime state before persistence", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-session-store-"));
    const store = new SessionStore(path.join(tempDir, ".sessions"));
    const session = createAgentSessionRecord("session_secret", 1000);
    session.history.push({ role: "user", content: "token=sk-12345678901234567890" });
    session.runtimeState.lastMemoryInput = "password=hunter2";

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
});
