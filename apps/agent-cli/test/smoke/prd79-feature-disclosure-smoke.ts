import assert from "node:assert/strict";

import { dispatchCliCommand } from "../../src/cli/commands.js";
import type { CliCommandContext } from "../../src/cli/commands.js";
import { CliPaletteStore } from "../../src/cli/palette.js";
import type { CliWorkflowMode } from "../../src/cli/workflow.js";

function createContext(): CliCommandContext {
  let workflow: CliWorkflowMode = "agent";
  const paletteStore = new CliPaletteStore();
  return {
    activeSessionId: "s01",
    createSession: () => ({ id: "s02" }),
    listSessions: () => [{ id: "s01", messageCount: 1, busy: false, active: true }],
    useSession: () => true,
    listTools: async () => [],
    getStatus: async () => ({
      workspace: "repo",
      mode: "interactive",
      model: "gpt-test",
      activeSessionId: "s01",
      sessionCount: 1,
      toolCount: 0,
      mcpToolCount: 0,
      mcpServerCount: 0,
      hookCount: 0,
      bridgeEndpoint: "/events",
      schedulerStatus: "1000ms",
      theme: "atlas",
      permissionMode: "default",
      bashSandboxMode: "workspace-write",
      pendingApprovals: 0,
      workspaceRoots: ["repo"],
      sessionPromptTokens: 0,
      sessionCompletionTokens: 0,
      dailyPromptTokens: 0,
      dailyCompletionTokens: 0,
      sessionEstimatedCostUsd: 0,
      dailyEstimatedCostUsd: 0,
      sessionTokenBudget: 1000,
      dailyTokenBudget: 2000,
    }),
    getConfig: async () => ({
      modelConfigured: true,
      model: "gpt-test",
      openAiBaseUrl: "",
      mcpConfigPath: ".codex/mcp.json",
      mcpConfigured: false,
      hooksConfigPath: ".codex/hooks.json",
      hooksConfigured: false,
      releaseCheckConfigured: true,
      theme: "atlas",
      permissionMode: "default",
      bashSandboxMode: "workspace-write",
      workspaceRoots: ["repo"],
    }),
    getMcpStatus: async () => [],
    resetMcpAuthFailures: async () => ({ cleared: 0 }),
    getPermissions: async () => ({
      mode: "default",
      pendingApprovals: 0,
      approvedApprovals: 0,
      rejectedApprovals: 0,
      expiredApprovals: 0,
      consumedApprovals: 0,
    }),
    setPermissionMode: () => true,
    listApprovals: async () => JSON.stringify({ ok: true, approvals: [] }),
    approveRequest: async () => JSON.stringify({ ok: true, request: {} }),
    rejectRequest: async () => JSON.stringify({ ok: true, request: {} }),
    listSkills: async () => ({ skills: [], loadedNames: [], missingNames: [] }),
    getSkill: async () => null,
    dumpSystemPrompt: async () => ({
      dump: {
        inspectionMode: "default",
        primarySystemPrompt: "",
        supplementalSystemMessages: [],
        stableSectionIds: [],
        dynamicSectionIds: [],
        protectedExportPath: null,
      },
      loadedNames: [],
      missingNames: [],
    }),
    getUsage: async () => ({
      model: "gpt-test",
      sessionPromptTokens: 0,
      sessionCompletionTokens: 0,
      dailyPromptTokens: 0,
      dailyCompletionTokens: 0,
      sessionEstimatedCostUsd: 0,
      dailyEstimatedCostUsd: 0,
      sessionTokenBudget: 1000,
      dailyTokenBudget: 2000,
      dayKey: "2026-05-23",
    }),
    canCompactSession: () => false,
    compactSession: async () => ({
      keptRecent: 0,
      oldMessageCount: 0,
      newMessageCount: 0,
      estimatedBefore: 0,
      estimatedAfter: 0,
      reducedBy: 0,
      transcriptBeforePath: "",
      transcriptAfterPath: "",
    }),
    isComposing: () => false,
    getComposeLineCount: () => 0,
    getComposeCharCount: () => 0,
    startCompose: () => ({ lineCount: 0, charCount: 0 }),
    appendComposeLine: () => ({ lineCount: 0, charCount: 0 }),
    previewCompose: () => null,
    popCompose: () => null,
    sendCompose: () => null,
    cancelCompose: () => null,
    getModel: () => "gpt-test",
    setModel: async () => true,
    addWorkspaceRoot: async (root) => ({ ok: true, root }),
    runDoctor: async () => ({ checks: [] }),
    getTheme: () => "atlas",
    setTheme: () => true,
    getWorkflow: () => workflow,
    setWorkflow: (mode) => {
      workflow = mode;
      return true;
    },
    showPalette: async (query = "") =>
      paletteStore.search(
        "s01",
        {
          sessions: [{ id: "s01", messageCount: 1, busy: false, active: true }],
          helpTopics: ["draft", "sessions", "runtime", "approvals", "transcript", "workflow", "palette", "all"],
          composerActive: false,
          pendingApprovals: 0,
          workflow,
        },
        query,
      ),
    openPalette: (index) => paletteStore.open("s01", index),
    showTranscript: () => ({ mode: "tail", total: 0, start: 0, end: 0, entries: [] }),
    searchTranscript: () => ({ mode: "search", query: "", total: 0, matches: [], selectedIndex: 0, selectedEntry: null, hasPrevMatch: false, hasNextMatch: false }),
    moveTranscriptSearch: () => null,
    peekTranscript: () => null,
    moveTranscriptPeek: () => null,
    tailTranscript: () => ({ mode: "tail", total: 0, start: 0, end: 0, entries: [] }),
  };
}

const context = createContext();
const features = await dispatchCliCommand("/features", context);
assert.equal(features.handled, true);
assert.match(features.output, /Feature Disclosure/);
assert.match(features.output, /hidden commands\s+none registered/);
assert.match(features.output, /easter eggs\s+none registered/);

const palette = await dispatchCliCommand("/palette feature", context);
assert.match(palette.output, /\/features/);

console.log("PRD-79 feature disclosure smoke passed");
