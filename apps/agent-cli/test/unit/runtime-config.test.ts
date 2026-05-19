import { describe, expect, it } from "vitest";
import { getBashSandboxMode, RUNTIME_CONFIG } from "../../src/runtime-config.js";

describe("runtime-config", () => {
  it("should expose positive numeric defaults", () => {
    expect(RUNTIME_CONFIG.bashTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.bashMaxOutputChars).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.bashSandboxMode).toBe("workspace-write");
    expect(RUNTIME_CONFIG.compactThresholdTokens).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.compactMinReductionTokens).toBeGreaterThanOrEqual(0);
    expect(RUNTIME_CONFIG.modelContextWindowTokens).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.modelContextReserveTokens).toBeGreaterThanOrEqual(0);
    expect(RUNTIME_CONFIG.modelMaxCompletionTokens).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryContinuationMaxAttempts).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryCompactMaxAttempts).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryTransportMaxAttempts).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryBackoffBaseMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryBackoffMaxMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.schedulerPollIntervalMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.autonomyIdleTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.subagentDefaultWaitTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.mcpStartupTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.mcpRequestTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.mcpToolRetryMaxAttempts).toBeGreaterThanOrEqual(0);
    expect(RUNTIME_CONFIG.deliveryStageTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.deliveryRetryMaxAttempts).toBeGreaterThanOrEqual(0);
    expect(RUNTIME_CONFIG.modelSessionTokenBudget).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.modelDailyTokenBudget).toBeGreaterThan(0);
  });

  it("normalizes bash sandbox mode values", () => {
    expect(getBashSandboxMode({})).toBe("workspace-write");
    expect(getBashSandboxMode({ AGENT_BASH_SANDBOX_MODE: "off" })).toBe("off");
    expect(getBashSandboxMode({ AGENT_BASH_SANDBOX_MODE: "strict-readonly" })).toBe("strict-readonly");
    expect(getBashSandboxMode({ AGENT_BASH_SANDBOX_MODE: "invalid" })).toBe("workspace-write");
  });
});
