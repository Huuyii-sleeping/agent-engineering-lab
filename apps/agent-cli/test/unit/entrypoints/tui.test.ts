import { describe, expect, it, vi } from "vitest";
import {
  handleTerminalTuiCommand,
  renderTerminalTuiDashboard,
  type TerminalTuiServiceLike,
} from "../../../src/entrypoints/tui.js";

function createService(): TerminalTuiServiceLike {
  const sessions = [{ id: "s01", busy: false, history: [] as unknown[] }];
  return {
    bridgeManifest: () => ({ endpoints: { events: "/events" } }),
    createSession: vi.fn(() => {
      const session = { id: "s02", busy: false, history: [] as unknown[] };
      sessions.push(session);
      return session;
    }),
    listSessions: vi.fn(() => sessions),
    toolsMetadata: vi.fn(async () => [{ name: "read_file", target: "base", description: "Read" }]),
    chat: vi.fn(async (input) => ({
      ok: true,
      assistant: `reply:${input.message}`,
      session: { id: input.session_id ?? "s01" },
    })),
  };
}

describe("entrypoints/tui", () => {
  it("renders dashboard state", () => {
    const dashboard = renderTerminalTuiDashboard({
      activeSessionId: "s01",
      sessionCount: 2,
      toolCount: 3,
      bridgeEndpoint: "/events",
    });

    expect(dashboard).toContain("agent-cli TUI");
    expect(dashboard).toContain("active session: s01");
    expect(dashboard).toContain("bridge: /events");
  });

  it("handles session and tool commands", async () => {
    const service = createService();
    const created = await handleTerminalTuiCommand({ line: "/new", service, activeSessionId: null });
    const sessions = await handleTerminalTuiCommand({
      line: "/sessions",
      service,
      activeSessionId: created.activeSessionId,
    });
    const tools = await handleTerminalTuiCommand({
      line: "/tools",
      service,
      activeSessionId: created.activeSessionId,
    });

    expect(created).toMatchObject({ activeSessionId: "s02", output: "created session s02" });
    expect(sessions.output).toContain("* s02");
    expect(tools.output).toContain("read_file [base] Read");
  });

  it("routes plain input through chat using the active session", async () => {
    const service = createService();
    const result = await handleTerminalTuiCommand({
      line: "hello",
      service,
      activeSessionId: "s01",
    });

    expect(service.chat).toHaveBeenCalledWith({ session_id: "s01", message: "hello" });
    expect(result).toMatchObject({ activeSessionId: "s01", output: "reply:hello", exit: false });
  });
});
