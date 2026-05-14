import { describe, expect, it, vi } from "vitest";
import { CliComposerStore } from "../../../src/cli-composer.js";
import { CliPaletteStore } from "../../../src/cli-palette.js";
import { CliTranscriptBrowserStore } from "../../../src/cli-transcript.js";
import {
  createTerminalTuiPaletteState,
  getTerminalTuiSelectedPaletteCandidate,
  handleTerminalTuiCommand,
  highlightTerminalTuiPaletteQuery,
  moveTerminalTuiPaletteSelection,
  renderTerminalTuiDashboard,
  renderTerminalTuiPaletteBarLines,
  renderTerminalTuiPaletteLines,
  resolveTerminalTuiPaletteLiveQuery,
  resolveTerminalTuiShortcut,
  updateTerminalTuiPaletteState,
  type TerminalTuiServiceLike,
} from "../../../src/entrypoints/tui.js";

function createService(): TerminalTuiServiceLike {
  const sessions = [
    {
      id: "s01",
      busy: false,
      history: [
        { role: "user", content: "first prompt" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "second prompt" },
        { role: "assistant", content: "hook blocked during run" },
      ] as unknown[],
    },
  ];
  return {
    bridgeManifest: () => ({ endpoints: { events: "/events" } }),
    createSession: vi.fn(() => {
      const session = { id: `s${String(sessions.length + 1).padStart(2, "0")}`, busy: false, history: [] as unknown[] };
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
      sessions: [
        { id: "s01", busy: false, messageCount: 2, active: true },
        { id: "s02", busy: false, messageCount: 0, active: false },
      ],
      guideLines: ["help      /help draft or Ctrl+G", "send      /send submits the current draft"],
      shortcutLines: ["ctrl+g    help", "ctrl+k    palette", "ctrl+n    next session", "esc       cancel draft"],
      footerSegments: ["model gpt-test", "session 1/2", "help /help ^G", "palette /palette ^K", "switch /next /prev /use", "keys ^G ^K ^N ^P ^L Esc"],
      paletteOpen: true,
      paletteBarLines: [
        "input     review",
        "selected  [1/2] /use 2",
        "preview   review session",
        "mode      live filter active | Enter open | Up/Down move | Esc close",
      ],
      paletteLines: [
        "query     review",
        "results   2 shown / 2 total",
        "selected  [1] /use 2",
        "actions   Enter open | Up/Down move | Esc close",
        "",
        "> [1] session  Switch to session [2] s02-review -> /use 2",
      ],
    });

    expect(dashboard).toContain("Agent CLI");
    expect(dashboard).toContain("mode");
    expect(dashboard).toContain("session");
    expect(dashboard).toContain("Draft");
    expect(dashboard).toContain("Guide");
    expect(dashboard).toContain("Shortcuts");
    expect(dashboard).toContain("[1]");
    expect(dashboard).toContain("/use 2 /next /prev");
    expect(dashboard).toContain("ctrl+g help");
    expect(dashboard).toContain("ctrl+k palette");
    expect(dashboard).toContain("palette /palette ^K");
    expect(dashboard).toContain("keys ^G ^K ^N ^P ^L Esc");
    expect(dashboard).toContain("Command Bar");
    expect(dashboard).toContain("Palette Results");
    expect(dashboard).toContain("palette-live");
    expect(dashboard).toContain("live filter active");
    expect(dashboard).toContain("Enter open | Up/Down move | Esc close");
    expect(dashboard).toContain("preview review session");
    expect(dashboard).toContain("actions /preview /send");
    expect(dashboard).toContain("/pop /cancel");
  });

  it("tracks palette selection state locally for the TUI", () => {
    const opened = updateTerminalTuiPaletteState({
      state: createTerminalTuiPaletteState(),
      open: true,
      view: {
        query: "review",
        total: 2,
        candidates: [
          {
            id: "review",
            group: "session",
            title: "Switch to session [2] s02-review",
            summary: "review session",
            command: "/use 2",
            keywords: ["review"],
          },
          {
            id: "history",
            group: "browse",
            title: "Browse transcript window",
            summary: "transcript",
            command: "/history",
            keywords: ["history"],
          },
        ],
      },
    });
    const moved = moveTerminalTuiPaletteSelection(opened, 1);

    expect(getTerminalTuiSelectedPaletteCandidate(opened)?.command).toBe("/use 2");
    expect(getTerminalTuiSelectedPaletteCandidate(moved)?.command).toBe("/history");
    expect(renderTerminalTuiPaletteLines(moved)).toContain("selected  [2] /history");
  });

  it("derives live palette queries from local key input", () => {
    expect(resolveTerminalTuiPaletteLiveQuery("", { sequence: "r", name: "r" })).toBe("r");
    expect(resolveTerminalTuiPaletteLiveQuery("re", { sequence: "v", name: "v" })).toBe("rev");
    expect(resolveTerminalTuiPaletteLiveQuery("review", { name: "backspace" })).toBe("revie");
    expect(resolveTerminalTuiPaletteLiveQuery("review", { ctrl: true, name: "n" })).toBeNull();
    expect(resolveTerminalTuiPaletteLiveQuery("review", { name: "enter", sequence: "\r" })).toBeNull();
  });

  it("highlights palette matches and renders preview text for the selected candidate", () => {
    expect(highlightTerminalTuiPaletteQuery("review session", "review")).toBe("<<review>> session");
    const state = updateTerminalTuiPaletteState({
      state: createTerminalTuiPaletteState(),
      open: true,
      view: {
        query: "review",
        total: 1,
        candidates: [
          {
            id: "review",
            group: "session",
            title: "Switch to session [2] s02-review",
            summary: "review session",
            command: "/use 2",
            keywords: ["review"],
          },
        ],
      },
    });

    expect(renderTerminalTuiPaletteBarLines(state)).toContain("preview   <<review>> session");
    expect(renderTerminalTuiPaletteLines(state).join("\n")).toContain("s02-<<review>>");
    expect(renderTerminalTuiPaletteLines(state)).toContain("search    Type to filter locally");
  });

  it("resolves supported keyboard shortcuts only when the prompt buffer is empty", () => {
    expect(
      resolveTerminalTuiShortcut({
        key: { ctrl: true, name: "g" },
        bufferEmpty: true,
        composerActive: false,
      }),
    ).toEqual({ command: "/help", label: "ctrl+g" });
    expect(
      resolveTerminalTuiShortcut({
        key: { ctrl: true, name: "n" },
        bufferEmpty: true,
        composerActive: false,
      }),
    ).toEqual({ command: "/next", label: "ctrl+n" });
    expect(
      resolveTerminalTuiShortcut({
        key: { ctrl: true, name: "k" },
        bufferEmpty: true,
        composerActive: false,
      }),
    ).toEqual({ command: "/palette", label: "ctrl+k" });
    expect(
      resolveTerminalTuiShortcut({
        key: { ctrl: true, name: "p" },
        bufferEmpty: true,
        composerActive: false,
      }),
    ).toEqual({ command: "/prev", label: "ctrl+p" });
    expect(
      resolveTerminalTuiShortcut({
        key: { ctrl: true, name: "l" },
        bufferEmpty: true,
        composerActive: false,
      }),
    ).toEqual({ command: "/redraw", label: "ctrl+l" });
    expect(
      resolveTerminalTuiShortcut({
        key: { name: "escape" },
        bufferEmpty: true,
        composerActive: true,
      }),
    ).toEqual({ command: "/cancel", label: "esc" });
    expect(
      resolveTerminalTuiShortcut({
        key: { ctrl: true, name: "k" },
        bufferEmpty: false,
        composerActive: false,
      }),
    ).toBeNull();
    expect(
      resolveTerminalTuiShortcut({
        key: { ctrl: true, name: "n" },
        bufferEmpty: false,
        composerActive: false,
      }),
    ).toBeNull();
    expect(
      resolveTerminalTuiShortcut({
        key: { name: "escape" },
        bufferEmpty: true,
        composerActive: false,
      }),
    ).toBeNull();
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
    expect(sessions.output).toContain("* [2]");
    expect(sessions.output).toContain("s02");
    expect(tools.output).toContain("Tools");
    expect(tools.output).toContain("read_file [base] Read");
  });

  it("supports sequential and selector-based session navigation in the TUI", async () => {
    const service = createService();
    const composer = new CliComposerStore();
    const second = await handleTerminalTuiCommand({
      line: "/new",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    const third = await handleTerminalTuiCommand({
      line: "/new",
      service,
      activeSessionId: second.activeSessionId,
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    const useLatest = await handleTerminalTuiCommand({
      line: "/use latest",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    const next = await handleTerminalTuiCommand({
      line: "/next",
      service,
      activeSessionId: "s02",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    const prev = await handleTerminalTuiCommand({
      line: "/prev",
      service,
      activeSessionId: "s02",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });
    const usePrefix = await handleTerminalTuiCommand({
      line: "/use s03",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer,
    });

    expect(third.activeSessionId).toBe("s03");
    expect(useLatest).toMatchObject({ activeSessionId: "s03" });
    expect(next).toMatchObject({ activeSessionId: "s03" });
    expect(prev).toMatchObject({ activeSessionId: "s01" });
    expect(usePrefix).toMatchObject({ activeSessionId: "s03" });
    expect(useLatest.output).toContain("[3/3]");
  });

  it("supports transcript browse commands in the TUI", async () => {
    const service = createService();
    const transcriptBrowser = new CliTranscriptBrowserStore(2);

    const history = await handleTerminalTuiCommand({
      line: "/history",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
      transcriptBrowser,
    });
    const prev = await handleTerminalTuiCommand({
      line: "/history prev",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
      transcriptBrowser,
    });
    const search = await handleTerminalTuiCommand({
      line: "/search hook",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
      transcriptBrowser,
    });
    const peek = await handleTerminalTuiCommand({
      line: "/peek 4",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
      transcriptBrowser,
    });

    expect(history.output).toContain("window");
    expect(prev.output).toContain("#02");
    expect(search.output).toContain("query     hook");
    expect(peek.output).toContain("entry     #04 assistant");
  });

  it("supports palette commands in the TUI", async () => {
    const service = createService();
    const paletteStore = new CliPaletteStore();

    const palette = await handleTerminalTuiCommand({
      line: "/palette s01",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
      paletteStore,
    });
    const open = await handleTerminalTuiCommand({
      line: "/palette open 1",
      service,
      activeSessionId: "s01",
      model: "gpt-test",
      setModel: vi.fn(async () => true),
      composer: new CliComposerStore(),
      paletteStore,
    });

    expect(palette.output).toContain("Palette");
    expect(palette.output).toContain("/use 1");
    expect(open.output).toContain("palette [1] -> /use 1");
    expect(open.output).toContain("using session [1/1] s01");
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
