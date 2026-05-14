import { mkdtemp, rm } from "node:fs/promises";
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
});
