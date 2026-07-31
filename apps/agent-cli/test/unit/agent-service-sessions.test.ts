import { describe, expect, it } from "vitest";
import {
  createAgentSessionRecord,
  sortSessionsByCreatedAt,
  summarizeSession,
} from "../../src/service-api/sessions.js";

describe("agent-service-sessions", () => {
  it("creates isolated session records with stable summary shape", () => {
    const session = createAgentSessionRecord("session_1", 1000);
    session.history.push({ role: "user", content: "hello" });
    session.rounds = 2;

    expect(session).toMatchObject({
      id: "session_1",
      createdAt: 1000,
      updatedAt: 1000,
      busy: false,
      history: [{ role: "user", content: "hello" }],
    });
    expect(summarizeSession(session)).toEqual({
      id: "session_1",
      createdAt: 1000,
      updatedAt: 1000,
      busy: false,
      messageCount: 1,
      rounds: 2,
      agent: null,
      runtimeBackend: "mastra",
      adapterVersion: "mastra-agent-v1",
    });
  });

  it("sorts sessions by creation time", () => {
    const later = createAgentSessionRecord("later", 2000);
    const earlier = createAgentSessionRecord("earlier", 1000);

    expect(sortSessionsByCreatedAt([later, earlier]).map((item) => item.id)).toEqual([
      "earlier",
      "later",
    ]);
  });
});
