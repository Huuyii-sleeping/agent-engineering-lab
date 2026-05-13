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
    runToolByName: vi.fn(async (_name: string, argsJson: string) => {
      const parsed = JSON.parse(argsJson) as { command?: string };
      return `ran:${parsed.command ?? ""}`;
    }),
  };
}

describe("entrypoints/tui", () => {
  it("renders dashboard state", () => {
    const dashboard = renderTerminalTuiDashboard({
      model: "gpt-test",
      activeSessionId: "s01",
      sessionCount: 2,
      toolCount: 3,
      bridgeEndpoint: "/events",
    });

    expect(dashboard).toContain("Agent CLI");
    expect(dashboard).toContain("mode");
    expect(dashboard).toContain("session");
  });

  it("handles session and tool commands", async () => {
    const service = createService();
    const created = await handleTerminalTuiCommand({
      line: "/new",
      service,
      activeSessionId: null,
      model: "gpt-test",
      setModel: vi.fn(async () => true),
    });
    const sessions = await handleTerminalTuiCommand({
      line: "/sessions",
      service,
      activeSessionId: created.activeSessionId,
      model: "gpt-test",
      setModel: vi.fn(async () => true),
    });
    const tools = await handleTerminalTuiCommand({
      line: "/tools",
      service,
      activeSessionId: created.activeSessionId,
      model: "gpt-test",
      setModel: vi.fn(async () => true),
    });

    expect(created).toMatchObject({ activeSessionId: "s02", output: "started fresh session s02" });
    expect(sessions.output).toContain("* s02");
    expect(tools.output).toContain("Tools");
    expect(tools.output).toContain("read_file [base] Read");
  });

  it("routes plain input through chat using the active session", async () => {
    const service = createService();
    const result = await handleTerminalTuiCommand({
      line: "hello",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
    });

    expect(service.chat).toHaveBeenCalledWith({ session_id: "s01", message: "hello" });
    expect(result).toMatchObject({ activeSessionId: "s01", exit: false });
    expect(result.output).toContain("Assistant");
    expect(result.output).toContain("reply:hello");
  });

  it("supports direct shell shortcuts in the TUI", async () => {
    const service = createService();
    const result = await handleTerminalTuiCommand({
      line: "!pwd",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
    });

    expect(result.output).toContain("Shell");
    expect(result.output).toContain("ran:pwd");
  });
});
