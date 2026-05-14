import { describe, expect, it, vi } from "vitest";
import { CliComposerStore } from "../../../src/cli-composer.js";
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
    runToolByName: vi.fn(async (name: string, argsJson: string) => {
      const parsed = JSON.parse(argsJson) as { command?: string; request_id?: string; status?: string };
      if (name === "security_list_approvals") {
        return JSON.stringify({
          ok: true,
          approvals: [
            {
              request_id: "apr_1",
              action: "write_file",
              risk: "medium",
              status: parsed.status ?? "pending",
              reason: "write operation requires approval",
            },
          ],
        });
      }
      if (name === "security_approve") {
        return JSON.stringify({
          ok: true,
          request: {
            request_id: parsed.request_id,
            action: "write_file",
            risk: "medium",
            status: "approved",
          },
        });
      }
      return `ran:${parsed.command ?? ""}`;
    }),
  };
}

describe("entrypoints/tui", () => {
  it("renders dashboard state", () => {
    const dashboard = renderTerminalTuiDashboard({
      model: "gpt-test",
      activeSessionId: "s01",
      composerActive: true,
      composerLineCount: 2,
      composerCharCount: 11,
      draftLines: ["summary  2 lines / 11 chars", "actions  /preview /send /pop /cancel", "", "01| hello", "02| world"],
      sessionCount: 2,
      toolCount: 3,
      bridgeEndpoint: "/events",
    });

    expect(dashboard).toContain("Agent CLI");
    expect(dashboard).toContain("mode");
    expect(dashboard).toContain("session");
    expect(dashboard).toContain("Draft");
    expect(dashboard).toContain("actions /preview /send");
    expect(dashboard).toContain("/pop /cancel");
  });

  it("handles session and tool commands", async () => {
    const service = createService();
    const created = await handleTerminalTuiCommand({
      line: "/new",
      service,
      activeSessionId: null,
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
    });
    const sessions = await handleTerminalTuiCommand({
      line: "/sessions",
      service,
      activeSessionId: created.activeSessionId,
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
    });
    const tools = await handleTerminalTuiCommand({
      line: "/tools",
      service,
      activeSessionId: created.activeSessionId,
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
    });

    expect(created).toMatchObject({ activeSessionId: "s02", output: "started fresh session s02" });
    expect(sessions.output).toContain("* s02");
    expect(tools.output).toContain("Tools");
    expect(tools.output).toContain("read_file [base] Read");
  });

  it("supports approval commands in the TUI", async () => {
    const service = createService();
    const approvals = await handleTerminalTuiCommand({
      line: "/approvals",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
    });
    const approve = await handleTerminalTuiCommand({
      line: "/approve apr_1",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
    });

    expect(approvals.output).toContain("Approvals");
    expect(approve.output).toContain("approved apr_1");
  });

  it("routes plain input through chat using the active session", async () => {
    const service = createService();
    const result = await handleTerminalTuiCommand({
      line: "hello",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
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
      composer: new CliComposerStore(),
    });

    expect(result.output).toContain("Shell");
    expect(result.output).toContain("ran:pwd");
  });

  it("supports composer flow in the TUI", async () => {
    const service = createService();
    const composer = new CliComposerStore();
    const start = await handleTerminalTuiCommand({
      line: "/compose",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    const append = await handleTerminalTuiCommand({
      line: "first line",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    const send = await handleTerminalTuiCommand({
      line: "/send",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });

    expect(start.output).toContain("composer started");
    expect(append.output).toContain("draft updated");
    expect(service.chat).toHaveBeenCalledWith({ session_id: "s01", message: "first line" });
    expect(send.output).toContain("submitting draft");
    expect(send.output).toContain("reply:first line");
  });

  it("preserves blank lines and supports /pop in the TUI composer", async () => {
    const service = createService();
    const composer = new CliComposerStore();
    await handleTerminalTuiCommand({
      line: "/compose",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    await handleTerminalTuiCommand({
      line: "first line",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    await handleTerminalTuiCommand({
      line: "",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    const preview = await handleTerminalTuiCommand({
      line: "/preview",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    const pop = await handleTerminalTuiCommand({
      line: "/pop",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });

    expect(preview.output).toContain("01| first line");
    expect(preview.output).toContain("02|");
    expect(pop.output).toContain("removed 1 line(s)");
  });
});
