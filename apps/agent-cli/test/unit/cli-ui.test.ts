import { afterEach, describe, expect, it } from "vitest";
import {
  renderCliBanner,
  renderCliCloseout,
  renderCliCompactSummary,
  renderCliDoctor,
  renderCliError,
  renderCliHelp,
  renderCliPermissions,
  renderCliStatus,
  renderCliUsage,
  resetCliUiForTest,
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
  });

  it("renders help and structured errors", () => {
    setCliUiColorEnabled(false);
    expect(renderCliHelp()).toContain("/permissions");
    expect(renderCliHelp()).toContain("!<cmd>");
    expect(renderCliError("startup", "MODEL_ID missing", "run /doctor")).toContain("next  run /doctor");
  });
});
