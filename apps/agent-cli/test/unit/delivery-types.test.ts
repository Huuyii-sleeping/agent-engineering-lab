import { describe, expect, it } from "vitest";
import { DELIVERY_MAX_CAPTURE, summarizeDeliveryReport, truncateDeliveryOutput } from "../../src/delivery-types.js";
import type { DeliveryReport } from "../../src/delivery-types.js";

function createReport(overrides: Partial<DeliveryReport> = {}): DeliveryReport {
  return {
    schemaVersion: 1,
    generatedAt: 1,
    mode: "manual",
    changedPaths: [],
    summary: {
      status: "passed",
      totalStages: 1,
      passedStages: 1,
      failedStages: 0,
      skippedStages: 0,
    },
    stages: [],
    latestFailure: null,
    risks: [],
    suggestions: [],
    ...overrides,
  };
}

describe("delivery types helpers", () => {
  it("trims and caps captured command output", () => {
    expect(truncateDeliveryOutput("  ok  ")).toBe("ok");
    expect(truncateDeliveryOutput("   ")).toBe("");

    const output = "a".repeat(DELIVERY_MAX_CAPTURE + 1);
    const truncated = truncateDeliveryOutput(output);

    expect(truncated).toHaveLength(DELIVERY_MAX_CAPTURE + `\n...[truncated to ${DELIVERY_MAX_CAPTURE} chars]`.length);
    expect(truncated.endsWith(`...[truncated to ${DELIVERY_MAX_CAPTURE} chars]`)).toBe(true);
  });

  it("summarizes passing and failed reports without changing tool-facing wording", () => {
    expect(summarizeDeliveryReport(createReport())).toBe("delivery validation passed: 1/1 stages passed");
    expect(
      summarizeDeliveryReport(
        createReport({
          summary: {
            status: "failed",
            totalStages: 2,
            passedStages: 1,
            failedStages: 1,
            skippedStages: 0,
          },
          latestFailure: {
            stage: "build",
            code: "BUILD_FAILED",
            message: "type error",
            suggestion: "fix types",
          },
        }),
      ),
    ).toBe("delivery validation failed at build: BUILD_FAILED - type error");
  });
});
