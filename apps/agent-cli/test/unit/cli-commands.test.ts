import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchCliCommand } from "../../src/cli-commands.js";
import type { CliCommandContext } from "../../src/cli-commands.js";
import { resetCliPermissionModeForTest } from "../../src/cli-permissions.js";

function createContext(): CliCommandContext {
  let theme: "atlas" | "plain" = "atlas";
  let model = "gpt-test";
  return {
    activeSessionId: "s01",
    createSession: vi.fn(() => ({ id: "s02" })),
    listSessions: vi.fn(() => [{ id: "s01", messageCount: 2, busy: false, active: true }]),
    useSession: vi.fn((sessionId: string) => sessionId === "s01"),
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
    expect((await dispatchCliCommand("/cost", context)).output).toContain("Usage");
    expect((await dispatchCliCommand("/compact 5", context)).output).toContain("Compact");
    expect((await dispatchCliCommand("/add-dir /tmp/demo", context)).output).toContain("added workspace root /tmp/demo");
  });

  it("rejects unknown commands with stable help", async () => {
    const result = await dispatchCliCommand("/missing", createContext());
    expect(result.handled).toBe(true);
    expect(result.output).toContain("unknown command");
    expect(result.output).toContain("run /help");
  });
});
