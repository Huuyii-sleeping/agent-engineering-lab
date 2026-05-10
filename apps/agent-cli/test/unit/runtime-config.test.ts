import { describe, expect, it } from "vitest";
import { RUNTIME_CONFIG } from "../../src/runtime-config.js";

describe("runtime-config", () => {
  it("should expose positive numeric defaults", () => {
    expect(RUNTIME_CONFIG.bashTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.bashMaxOutputChars).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.compactThresholdTokens).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryContinuationMaxAttempts).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryCompactMaxAttempts).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryTransportMaxAttempts).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryBackoffBaseMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.recoveryBackoffMaxMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.autonomyIdleTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.subagentDefaultWaitTimeoutMs).toBeGreaterThan(0);
  });
});

