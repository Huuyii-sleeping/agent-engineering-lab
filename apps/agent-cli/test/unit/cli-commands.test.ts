import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchCliCommand } from "../../src/cli-commands.js";
import type { CliCommandContext } from "../../src/cli-commands.js";
import { CliPaletteStore } from "../../src/cli-palette.js";
import { resetCliPermissionModeForTest } from "../../src/cli-permissions.js";
import { CliTranscriptBrowserStore } from "../../src/cli-transcript.js";

function createContext(input: {
  activeSessionId?: string;
  sessions?: Array<{ id: string; messageCount: number; busy?: boolean }>;
  transcriptMessages?: Array<{ role: string; content: string }>;
} = {}): CliCommandContext {
  let theme: "atlas" | "plain" = "atlas";
  let model = "gpt-test";
  let composeLines: string[] | null = null;
  const paletteStore = new CliPaletteStore();
  const transcriptBrowser = new CliTranscriptBrowserStore(2);
  const activeSessionId = input.activeSessionId ?? "s01";
  const sessions = [
    ...(input.sessions ?? [{ id: "s01", messageCount: 2, busy: false }]).map((session) => ({
      id: session.id,
      messageCount: session.messageCount,
      busy: session.busy ?? false,
    })),
  ];
  const transcriptMessages = input.transcriptMessages ?? [
    { role: "user", content: "first prompt" },
    { role: "assistant", content: "first answer" },
    { role: "user", content: "second prompt" },
    { role: "assistant", content: "hook blocked during run" },
  ];
  return {
    activeSessionId,
    createSession: vi.fn(() => {
      const session = { id: `s${String(sessions.length + 1).padStart(2, "0")}`, messageCount: 0, busy: false };
      sessions.push(session);
      return { id: session.id };
    }),
    listSessions: vi.fn(() =>
      sessions.map((session) => ({
        id: session.id,
        messageCount: session.messageCount,
        busy: session.busy,
        active: session.id === activeSessionId,
      })),
    ),
    useSession: vi.fn((sessionId: string) => sessions.some((session) => session.id === sessionId)),
    listTools: vi.fn(async () => [{ name: "read_file", target: "base", description: "Read" }]),
    getStatus: vi.fn(async () => ({
      workspace: "repo",
      mode: "interactive",
      model: "gpt-test",
      activeSessionId: "s01",
      sessionCount: 1,
      toolCount: 1,
      mcpToolCount: 0,
      mcpServerCount: 0,
      hookCount: 0,
      bridgeEndpoint: "/events",
      schedulerStatus: "1000ms",
      theme,
      permissionMode: "default",
      pendingApprovals: 0,
      workspaceRoots: ["/repo"],
      sessionPromptTokens: 120,
      sessionCompletionTokens: 40,
      dailyPromptTokens: 240,
      dailyCompletionTokens: 80,
      sessionEstimatedCostUsd: 0.0032,
      dailyEstimatedCostUsd: 0.0064,
      sessionTokenBudget: 1000,
      dailyTokenBudget: 2000,
    })),
    getConfig: vi.fn(async () => ({
      modelConfigured: true,
      model,
      openAiBaseUrl: "",
      mcpConfigPath: ".codex/mcp.json",
      mcpConfigured: false,
      hooksConfigPath: ".codex/hooks.json",
      hooksConfigured: false,
      releaseCheckConfigured: true,
      theme,
      permissionMode: "default",
      workspaceRoots: ["/repo"],
    })),
    getPermissions: vi.fn(async () => ({
      mode: "default",
      pendingApprovals: 0,
      approvedApprovals: 0,
      rejectedApprovals: 0,
      expiredApprovals: 0,
      consumedApprovals: 0,
    })),
    setPermissionMode: vi.fn(() => true),
    listApprovals: vi.fn(async () =>
      JSON.stringify({
        ok: true,
        approvals: [
          {
            request_id: "apr_1",
            action: "write_file",
            risk: "medium",
            status: "pending",
            reason: "write operation requires approval",
          },
        ],
      }),
    ),
    approveRequest: vi.fn(async (requestId: string) =>
      JSON.stringify({
        ok: true,
        request: {
          request_id: requestId,
          action: "write_file",
          risk: "medium",
          status: "approved",
        },
      }),
    ),
    rejectRequest: vi.fn(async (requestId: string) =>
      JSON.stringify({
        ok: true,
        request: {
          request_id: requestId,
          action: "write_file",
          risk: "medium",
          status: "rejected",
        },
      }),
    ),
    getUsage: vi.fn(async () => ({
      model,
      sessionPromptTokens: 120,
      sessionCompletionTokens: 40,
      dailyPromptTokens: 240,
      dailyCompletionTokens: 80,
      sessionEstimatedCostUsd: 0.0032,
      dailyEstimatedCostUsd: 0.0064,
      sessionTokenBudget: 1000,
      dailyTokenBudget: 2000,
      dayKey: "2026-05-13",
    })),
    compactSession: vi.fn(async () => ({
      keptRecent: 5,
      oldMessageCount: 10,
      newMessageCount: 6,
      estimatedBefore: 100,
      estimatedAfter: 60,
      reducedBy: 40,
      transcriptBeforePath: ".transcripts/before.jsonl",
      transcriptAfterPath: ".transcripts/after.jsonl",
    })),
    isComposing: () => Array.isArray(composeLines),
    getComposeLineCount: () => composeLines?.length ?? 0,
    getComposeCharCount: () => composeLines?.join("\n").length ?? 0,
    startCompose: vi.fn(() => {
      composeLines = composeLines ?? [];
      return { lineCount: composeLines.length, charCount: composeLines.join("\n").length };
    }),
    appendComposeLine: vi.fn((line: string) => {
      composeLines = [...(composeLines ?? []), line];
      return { lineCount: composeLines.length, charCount: composeLines.join("\n").length };
    }),
    previewCompose: vi.fn(() =>
      composeLines
        ? { lineCount: composeLines.length, charCount: composeLines.join("\n").length, content: composeLines.join("\n") }
        : null,
    ),
    popCompose: vi.fn((count: number) => {
      if (!composeLines) {
        return null;
      }
      const removeCount = Math.max(0, Math.min(count, composeLines.length));
      composeLines = composeLines.slice(0, composeLines.length - removeCount);
      return {
        removedLineCount: removeCount,
        lineCount: composeLines.length,
        charCount: composeLines.join("\n").length,
        content: composeLines.join("\n"),
      };
    }),
    sendCompose: vi.fn(() => {
      if (!composeLines) {
        return null;
      }
      const content = composeLines.join("\n");
      const result = { lineCount: composeLines.length, charCount: content.length, content };
      composeLines = null;
      return result;
    }),
    cancelCompose: vi.fn(() => {
      if (!composeLines) {
        return null;
      }
      const content = composeLines.join("\n");
      const result = { lineCount: composeLines.length, charCount: content.length, content };
      composeLines = null;
      return result;
    }),
    getModel: () => model,
    setModel: vi.fn(async (nextModel: string) => {
      model = nextModel;
      return true;
    }),
    addWorkspaceRoot: vi.fn(async (root: string) => ({
      ok: true as const,
      root,
    })),
    runDoctor: vi.fn(async () => ({
      checks: [{ id: "model", label: "model", severity: "pass", reason: "ok", suggestion: "" }],
    })),
    getTheme: () => theme,
    setTheme: (nextTheme) => {
      theme = nextTheme;
      return true;
    },
    showPalette: async (query = "") =>
      paletteStore.search(
        activeSessionId,
        {
          sessions: sessions.map((session) => ({
            id: session.id,
            messageCount: session.messageCount,
            busy: session.busy,
            active: session.id === activeSessionId,
          })),
          helpTopics: ["draft", "sessions", "runtime", "approvals", "transcript", "palette", "all"],
          composerActive: Array.isArray(composeLines),
          pendingApprovals: 1,
        },
        query,
      ),
    openPalette: (index) => paletteStore.open(activeSessionId, index),
    showTranscript: (direction = "current") => transcriptBrowser.history(activeSessionId, transcriptMessages, direction),
    searchTranscript: (query) => transcriptBrowser.search(activeSessionId, transcriptMessages, query),
    peekTranscript: (entryIndex) => transcriptBrowser.peek(activeSessionId, transcriptMessages, entryIndex),
    tailTranscript: () => transcriptBrowser.tail(activeSessionId, transcriptMessages),
  };
}

describe("cli-commands", () => {
  afterEach(() => {
    resetCliPermissionModeForTest();
  });

  it("ignores non-slash input", async () => {
    expect(await dispatchCliCommand("hello", createContext())).toEqual({ handled: false });
  });

  it("renders help, status, and doctor without entering the model", async () => {
    const context = createContext();
    expect((await dispatchCliCommand("/help", context)).handled).toBe(true);
    expect((await dispatchCliCommand("/help draft", context)).output).toContain("Help: Draft");
    expect((await dispatchCliCommand("/help sessions", context)).output).toContain("/use <x>");
    expect((await dispatchCliCommand("/help missing", context)).output).toContain("unknown help topic");
    expect((await dispatchCliCommand("/status", context)).output).toContain("Status");
    expect((await dispatchCliCommand("/doctor", context)).output).toContain("Doctor");
  });

  it("handles theme, redraw, and clear commands deterministically", async () => {
    const context = createContext();
    const theme = await dispatchCliCommand("/theme plain", context);
    const redraw = await dispatchCliCommand("/redraw", context);
    const clear = await dispatchCliCommand("/clear", context);

    expect(theme).toMatchObject({ handled: true, output: "theme set to plain", clearScreen: true, showBanner: true });
    expect(redraw).toMatchObject({ handled: true, clearScreen: true, showBanner: true });
    expect(clear).toMatchObject({
      handled: true,
      clearScreen: true,
      showBanner: true,
      nextSessionId: "s02",
      output: "started fresh session s02",
    });
  });

  it("supports product control commands without entering the model", async () => {
    const context = createContext();

    expect((await dispatchCliCommand("/model", context)).output).toContain("gpt-test");
    expect((await dispatchCliCommand("/model gpt-5-mini", context)).output).toContain("model set to gpt-5-mini");
    expect((await dispatchCliCommand("/permissions", context)).output).toContain("Permissions");
    expect((await dispatchCliCommand("/permissions plan", context)).output).toContain("mode");
    expect((await dispatchCliCommand("/approvals", context)).output).toContain("Approvals");
    expect((await dispatchCliCommand("/approve apr_1", context)).output).toContain("approved apr_1");
    expect((await dispatchCliCommand("/reject apr_1", context)).output).toContain("rejected apr_1");
    expect((await dispatchCliCommand("/cost", context)).output).toContain("Usage");
    expect((await dispatchCliCommand("/compact 5", context)).output).toContain("Compact");
    expect((await dispatchCliCommand("/add-dir /tmp/demo", context)).output).toContain("added workspace root /tmp/demo");
    expect((await dispatchCliCommand("/sessions", context)).output).toContain("[1]");
    expect((await dispatchCliCommand("批准", context)).output).toContain("approved apr_1");
  });

  it("supports composer lifecycle and suppresses approval shortcuts while drafting", async () => {
    const context = createContext();

    expect((await dispatchCliCommand("/compose", context)).output).toContain("composer started");
    expect((await dispatchCliCommand("approve", context)).output).toContain("draft updated");
    expect((await dispatchCliCommand("", context)).output).toContain("draft updated");
    const preview = await dispatchCliCommand("/preview", context);
    expect(preview.output).toContain("Composer");
    expect(preview.output).toContain("01| approve");
    expect(preview.output).toContain("02|");
    expect((await dispatchCliCommand("/pop", context)).output).toContain("removed 1 line(s)");
    const send = await dispatchCliCommand("/send", context);
    expect(send).toMatchObject({
      handled: true,
      submitPrompt: "approve",
    });
    expect((await dispatchCliCommand("/cancel", context)).output).toContain("no active draft");
  });

  it("validates /pop arguments and draft presence", async () => {
    const context = createContext();

    expect((await dispatchCliCommand("/pop", context)).output).toContain("start with /compose");
    await dispatchCliCommand("/compose", context);
    expect((await dispatchCliCommand("/pop nope", context)).output).toContain("invalid pop count");
  });

  it("supports session selectors and sequential session navigation", async () => {
    const sessions = [
      { id: "s01-home", messageCount: 2 },
      { id: "s02-review", messageCount: 5 },
      { id: "s03-latest", messageCount: 1 },
    ];
    const useByIndex = await dispatchCliCommand(
      "/use 2",
      createContext({ activeSessionId: "s01-home", sessions }),
    );
    const useByLatest = await dispatchCliCommand(
      "/use latest",
      createContext({ activeSessionId: "s01-home", sessions }),
    );
    const useByPrefix = await dispatchCliCommand(
      "/use s03",
      createContext({ activeSessionId: "s01-home", sessions }),
    );
    const next = await dispatchCliCommand(
      "/next",
      createContext({ activeSessionId: "s02-review", sessions }),
    );
    const prev = await dispatchCliCommand(
      "/prev",
      createContext({ activeSessionId: "s02-review", sessions }),
    );

    expect(useByIndex).toMatchObject({ handled: true, nextSessionId: "s02-review" });
    expect(useByIndex.output).toContain("[2/3]");
    expect(useByLatest).toMatchObject({ handled: true, nextSessionId: "s03-latest" });
    expect(useByPrefix).toMatchObject({ handled: true, nextSessionId: "s03-latest" });
    expect(next).toMatchObject({ handled: true, nextSessionId: "s03-latest" });
    expect(prev).toMatchObject({ handled: true, nextSessionId: "s01-home" });
  });

  it("reports ambiguous or invalid session selectors", async () => {
    const sessions = [
      { id: "s02-alpha", messageCount: 2 },
      { id: "s02-beta", messageCount: 1 },
    ];
    const ambiguous = await dispatchCliCommand("/use s02", createContext({ activeSessionId: "s02-alpha", sessions }));
    const invalidIndex = await dispatchCliCommand("/use 9", createContext({ activeSessionId: "s02-alpha", sessions }));

    expect(ambiguous.output).toContain("ambiguous session selector");
    expect(invalidIndex.output).toContain("session index out of range");
  });

  it("supports transcript browsing, search, peek, and tail views", async () => {
    const context = createContext();

    const history = await dispatchCliCommand("/history", context);
    const prev = await dispatchCliCommand("/history prev", context);
    const search = await dispatchCliCommand("/search hook", context);
    const peek = await dispatchCliCommand("/peek 4", context);
    const tail = await dispatchCliCommand("/tail", context);

    expect(history.output).toContain("Transcript");
    expect(history.output).toContain("window");
    expect(prev.output).toContain("#02");
    expect(search.output).toContain("query     hook");
    expect(search.output).toContain("#04");
    expect(peek.output).toContain("entry     #04 assistant");
    expect(tail.output).toContain("tail");
  });

  it("supports palette search and direct candidate execution", async () => {
    const sessions = [
      { id: "s01-home", messageCount: 2 },
      { id: "s02-review", messageCount: 5 },
    ];
    const context = createContext({ activeSessionId: "s01-home", sessions });

    const palette = await dispatchCliCommand("/palette review", context);
    const open = await dispatchCliCommand("/palette open 1", context);

    expect(palette.output).toContain("Palette");
    expect(palette.output).toContain("/use 2");
    expect(open).toMatchObject({ handled: true, nextSessionId: "s02-review", showBanner: true });
    expect(open.output).toContain("palette [1] -> /use 2");
    expect(open.output).toContain("using session [2/2] s02-review");
  });

  it("validates palette open requests", async () => {
    const context = createContext();

    expect((await dispatchCliCommand("/palette open 1", context)).output).toContain("run /palette again");
    await dispatchCliCommand("/palette", context);
    expect((await dispatchCliCommand("/palette open nope", context)).output).toContain("invalid palette entry");
    expect((await dispatchCliCommand("/palette open 99", context)).output).toContain("palette entry not found");
  });

  it("validates transcript browse arguments", async () => {
    const context = createContext();

    expect((await dispatchCliCommand("/history nope", context)).output).toContain("unknown history action");
    expect((await dispatchCliCommand("/search", context)).output).toContain("missing search query");
    expect((await dispatchCliCommand("/peek nope", context)).output).toContain("invalid transcript entry");
    expect((await dispatchCliCommand("/peek 99", context)).output).toContain("transcript entry not found");
  });

  it("rejects unknown commands with stable help", async () => {
    const result = await dispatchCliCommand("/missing", createContext());
    expect(result.handled).toBe(true);
    expect(result.output).toContain("unknown command");
    expect(result.output).toContain("run /help");
  });
});
