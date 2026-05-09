import { describe, expect, it } from "vitest";
import { RUNTIME_CONFIG } from "./runtime-config.js";

describe("runtime-config", () => {
  it("should expose positive numeric defaults", () => {
    expect(RUNTIME_CONFIG.bashTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.bashMaxOutputChars).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.compactThresholdTokens).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.autonomyIdleTimeoutMs).toBeGreaterThan(0);
    expect(RUNTIME_CONFIG.subagentDefaultWaitTimeoutMs).toBeGreaterThan(0);
  });
});

