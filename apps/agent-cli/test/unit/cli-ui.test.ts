import { afterEach, describe, expect, it } from "vitest";
import {
  listCliHelpTopics,
  renderCliApprovals,
  renderCliBanner,
  renderCliCloseout,
  renderCliCompactSummary,
  renderCliComposer,
  renderCliComposerLines,
  renderCliDoctor,
  renderCliError,
  renderCliGuideLines,
  renderCliHelp,
  renderCliPalette,
  renderCliPaletteLines,
  renderCliPermissions,
  renderCliPromptDump,
  renderCliPrompt,
  renderCliSessions,
  renderCliSkillDetail,
  renderCliSkills,
  renderCliShortcutLines,
  renderCliStatus,
  renderCliTranscript,
  renderCliTranscriptLines,
  renderCliUsage,
  resetCliUiForTest,
  resolveCliHelpTopic,
  setCliUiColorEnabled,
} from "../../src/cli-ui.js";

afterEach(() => {
  resetCliUiForTest();
});

describe("cli-ui", () => {
  it("renders a readable banner without color", () => {
    setCliUiColorEnabled(false);
    const banner = renderCliBanner({
      title: "Agent CLI",
      workspace: "repo",
      mode: "interactive",
      model: "gpt-test",
      sessionId: "sess_1",
      commands: ["/help", "/status"],
    });

    expect(banner).toContain("Agent CLI");
    expect(banner).toContain("workspace  repo");
    expect(banner).not.toContain("\u001b[");
  });

  it("renders status, doctor, and closeout sections", () => {
    setCliUiColorEnabled(false);
    expect(
      renderCliStatus({
        workspace: "repo",
        mode: "interactive",
        model: "gpt-test",
        activeSessionId: "sess_1",
        sessionCount: 2,
        toolCount: 8,
        mcpToolCount: 2,
        mcpServerCount: 1,
        hookCount: 3,
        bridgeEndpoint: "/events",
        schedulerStatus: "1000ms",
        theme: "atlas",
        permissionMode: "accept-edits",
        pendingApprovals: 2,
        workspaceRoots: ["/repo", "/repo/docs"],
        sessionPromptTokens: 400,
        sessionCompletionTokens: 100,
        dailyPromptTokens: 800,
        dailyCompletionTokens: 200,
        sessionEstimatedCostUsd: 0.012,
        dailyEstimatedCostUsd: 0.024,
        sessionTokenBudget: 1000,
        dailyTokenBudget: 5000,
      }),
    ).toContain("permissions  accept-edits / 2 pending approvals");
    expect(
      renderCliDoctor({
        checks: [
          { id: "model", label: "model", severity: "error", reason: "missing", suggestion: "set MODEL_ID" },
        ],
      }),
    ).toContain("model: missing | set MODEL_ID");
    expect(
      renderCliCloseout({
        sessionId: "sess_1",
        changedPaths: ["apps/agent-cli/src/cli.ts"],
        validationSummary: "delivery validation passed",
      }),
    ).toContain("changes     apps/agent-cli/src/cli.ts");
    expect(
      renderCliPermissions({
        mode: "plan",
        pendingApprovals: 1,
        approvedApprovals: 2,
        rejectedApprovals: 3,
        expiredApprovals: 4,
        consumedApprovals: 5,
      }),
    ).toContain("approved  2");
    expect(
      renderCliApprovals([
        {
          requestId: "apr_1",
          action: "write_file",
          risk: "medium",
          status: "pending",
          reason: "write operation requires approval",
        },
      ]),
    ).toContain("pending apr_1 write_file (medium)");
    expect(
      renderCliSessions([
        {
          id: "sess_1",
          messageCount: 3,
          busy: false,
          active: true,
        },
      ]),
    ).toContain("[1] sess_1");
    expect(
      renderCliUsage({
        model: "gpt-test",
        sessionPromptTokens: 400,
        sessionCompletionTokens: 100,
        dailyPromptTokens: 800,
        dailyCompletionTokens: 200,
        sessionEstimatedCostUsd: 0.012,
        dailyEstimatedCostUsd: 0.024,
        sessionTokenBudget: 1000,
        dailyTokenBudget: 5000,
        dayKey: "2026-05-13",
      }),
    ).toContain("500/1000 tokens");
    expect(
      renderCliCompactSummary({
        keptRecent: 5,
        oldMessageCount: 20,
        newMessageCount: 6,
        estimatedBefore: 1000,
        estimatedAfter: 300,
        reducedBy: 700,
        transcriptBeforePath: ".transcripts/before.jsonl",
        transcriptAfterPath: ".transcripts/after.jsonl",
      }),
    ).toContain("tokens       1000 -> 300 (-700)");
    expect(
      renderCliComposer({
        lineCount: 2,
        charCount: 12,
        content: "hello\nworld",
      }),
    ).toContain("01| hello");
    expect(
      renderCliComposerLines({
        lineCount: 3,
        charCount: 4,
        content: "a\n\nb",
      }),
    ).toEqual(["01| a", "02|", "03| b"]);
  });

  it("renders help and structured errors", () => {
    setCliUiColorEnabled(false);
    expect(renderCliPrompt("sess_1", { active: true, lineCount: 2, charCount: 10 })).toContain("draft:sess_1");
    expect(renderCliHelp()).toContain("/help draft");
    expect(renderCliHelp()).toContain("/permissions");
    expect(renderCliHelp()).toContain("/approve");
    expect(renderCliHelp()).toContain("/compose");
    expect(renderCliHelp()).toContain("/next");
    expect(renderCliHelp()).toContain("/history");
    expect(renderCliHelp()).toContain("/workflow agent");
    expect(renderCliHelp()).toContain("/palette");
    expect(renderCliHelp()).toContain("/skills");
    expect(renderCliHelp()).toContain("/prompt");
    expect(renderCliHelp()).toContain("Ctrl+G help");
    expect(renderCliHelp()).toContain("Ctrl+K palette");
    expect(renderCliHelp("draft")).toContain("Help: Draft");
    expect(renderCliHelp("draft")).toContain("/preview");
    expect(renderCliHelp("sessions")).toContain("/use <x>");
    expect(renderCliHelp("transcript")).toContain("/search <q>");
    expect(renderCliHelp("workflow")).toContain("/workflow draw");
    expect(renderCliHelp("palette")).toContain("/palette open <n>");
    expect(renderCliHelp("all")).toContain("Help: Runtime");
    expect(renderCliHelp("all")).toContain("Help: Transcript");
    expect(renderCliHelp("all")).toContain("Help: Workflow");
    expect(renderCliHelp("all")).toContain("Help: Palette");
    expect(listCliHelpTopics()).toContain("runtime");
    expect(listCliHelpTopics()).toContain("transcript");
    expect(listCliHelpTopics()).toContain("workflow");
    expect(listCliHelpTopics()).toContain("palette");
    expect(resolveCliHelpTopic("draft")).toBe("draft");
    expect(resolveCliHelpTopic("missing")).toBeNull();
    expect(
      renderCliGuideLines({
        composerActive: true,
        sessionCount: 2,
        pendingApprovals: 1,
      }),
    ).toContain("browse    /history /search <q> /search next /peek <n>");
    expect(
      renderCliGuideLines({
        composerActive: false,
        sessionCount: 2,
        pendingApprovals: 0,
      }),
    ).toContain("browse    /history last /search bug /peek 12 /tail");
    expect(
      renderCliGuideLines({
        composerActive: false,
        sessionCount: 2,
        pendingApprovals: 0,
      }),
    ).toSatisfy((lines: string[]) => lines.some((line) => line.includes("/skills /prompt")));
    expect(
      renderCliGuideLines({
        composerActive: false,
        sessionCount: 2,
        pendingApprovals: 0,
        workflow: "draw",
      }),
    ).toContain("workflow  /workflow agent | /workflow draw");
    expect(
      renderCliSkills(
        [
          {
            name: "openspec-apply-change",
            description: "Implement tasks from an OpenSpec change.",
            path: ".codex/skills/openspec-apply-change/SKILL.md",
            root: ".codex/skills",
            loaded: true,
          },
        ],
        ["openspec-apply-change"],
        ["missing-skill"],
      ),
    ).toContain("openspec-apply-change");
    expect(
      renderCliSkillDetail({
        name: "openspec-apply-change",
        description: "Implement tasks from an OpenSpec change.",
        path: ".codex/skills/openspec-apply-change/SKILL.md",
        root: ".codex/skills",
        metadata: { name: "openspec-apply-change" },
        content: "Use the apply workflow.",
        loaded: true,
      }),
    ).toContain("Use the apply workflow.");
    expect(
      renderCliPromptDump(
        {
          primarySystemPrompt: "## Core\ncore",
          supplementalSystemMessages: [],
          stableSectionIds: ["core"],
          dynamicSectionIds: [],
        },
        ["openspec-apply-change"],
        ["missing-skill"],
      ),
    ).toContain("System Prompt");
    expect(
      renderCliShortcutLines({
        composerActive: false,
      }),
    ).toContain("ctrl+g    help");
    expect(
      renderCliShortcutLines({
        composerActive: false,
      }),
    ).toContain("ctrl+k    palette");
    expect(
      renderCliTranscriptLines({
        mode: "search",
        query: "hook",
        total: 4,
        matches: [
          {
            index: 4,
            role: "assistant",
            content: "hook blocked during run",
            preview: "hook blocked during run",
            lineCount: 1,
            charCount: 23,
          },
        ],
        selectedIndex: 0,
        selectedEntry: {
          index: 4,
          role: "assistant",
          content: "hook blocked during run",
          preview: "hook blocked during run",
          lineCount: 1,
          charCount: 23,
        },
        hasPrevMatch: false,
        hasNextMatch: false,
      }),
    ).toContain("query     hook");
    expect(
      renderCliTranscript({
        mode: "peek",
        total: 4,
        entry: {
          index: 4,
          role: "assistant",
          content: "hook blocked during run",
          preview: "hook blocked during run",
          lineCount: 1,
          charCount: 23,
        },
        hasPrev: true,
        hasNext: false,
      }),
    ).toContain("entry     #04 assistant");
    expect(renderCliError("startup", "MODEL_ID missing", "run /doctor")).toContain("next  run /doctor");
    expect(
      renderCliPaletteLines({
        query: "review",
        total: 2,
        candidates: [
          {
            id: "session-review",
            group: "session",
            title: "Switch to session [2] s02-review",
            summary: "review session",
            command: "/use 2",
            keywords: ["review"],
          },
        ],
      }).join("\n"),
    ).toContain("/palette open <index>");
    expect(
      renderCliPaletteLines({
        query: "review",
        total: 2,
        candidates: [
          {
            id: "session-review",
            group: "session",
            title: "Switch to session [2] s02-review",
            summary: "review session",
            command: "/use 2",
            keywords: ["review"],
          },
        ],
      }).join("\n"),
    ).toContain("group     session");
    expect(
      renderCliPalette({
        query: "review",
        total: 1,
        candidates: [
          {
            id: "session-review",
            group: "session",
            title: "Switch to session [2] s02-review",
            summary: "review session",
            command: "/use 2",
            keywords: ["review"],
          },
        ],
      }),
    ).toContain("Palette");
  });
});
