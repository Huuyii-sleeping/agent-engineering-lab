import { describe, expect, it } from "vitest";
import { shouldReloadSessionFromAgentEvent } from "./chat-stream-state";

describe("chat stream state helpers", () => {
  it("does not reload the active session while it is locally streaming", () => {
    expect(
      shouldReloadSessionFromAgentEvent({
        activeSessionId: "s1",
        streamingSessionId: "s1",
      }),
    ).toBe(false);
  });

  it("allows event-driven reloads when no active stream would be overwritten", () => {
    expect(
      shouldReloadSessionFromAgentEvent({
        activeSessionId: "s1",
        streamingSessionId: null,
      }),
    ).toBe(true);
    expect(
      shouldReloadSessionFromAgentEvent({
        activeSessionId: "s1",
        streamingSessionId: "s2",
      }),
    ).toBe(true);
    expect(
      shouldReloadSessionFromAgentEvent({
        activeSessionId: null,
        streamingSessionId: "s2",
      }),
    ).toBe(false);
  });
});
