import { describe, expect, it } from "vitest";
import {
  formatHarnessMatrixSummary,
  listHarnessMatrixScenarios,
  runHarnessScenarioMatrix,
} from "../../harness/matrix.js";

describe("harness scenario matrix", () => {
  it("lists stable production harness scenarios", () => {
    expect(listHarnessMatrixScenarios()).toEqual(
      expect.arrayContaining([
        {
          name: "assistant-only",
          description: expect.stringContaining("assistant"),
        },
        {
          name: "tool-driven-readonly-order",
          description: expect.stringContaining("tool"),
        },
        {
          name: "serial-write-side-effects",
          description: expect.stringContaining("serial"),
        },
        {
          name: "service-session-resume",
          description: expect.stringContaining("session resume"),
        },
      ]),
    );
  });

  it("runs selected scenarios and summarizes passing results", async () => {
    const matrix = await runHarnessScenarioMatrix({ names: ["assistant-only"] });

    expect(matrix).toMatchObject({
      total: 1,
      passed: 1,
      failed: 0,
    });
    expect(matrix.results[0]).toMatchObject({
      name: "assistant-only",
      status: "passed",
      failedStep: null,
    });

    expect(formatHarnessMatrixSummary(matrix)).toContain("assistant-only passed");
  });

  it("reports unknown selected scenarios as failed matrix results", async () => {
    const matrix = await runHarnessScenarioMatrix({ names: ["missing-scenario"] });

    expect(matrix).toMatchObject({
      total: 1,
      passed: 0,
      failed: 1,
    });
    expect(matrix.results[0]).toMatchObject({
      name: "missing-scenario",
      status: "failed",
      failedStep: "matrix selection",
    });
    expect(formatHarnessMatrixSummary(matrix)).toContain(
      "missing-scenario failed at matrix selection",
    );
  });

  it("runs the full production harness matrix", async () => {
    const matrix = await runHarnessScenarioMatrix();

    expect(matrix.failed).toBe(0);
    expect(matrix.passed).toBe(matrix.total);
    expect(matrix.results.map((result) => result.name)).toEqual([
      "assistant-only",
      "tool-driven-readonly-order",
      "hook-blocked",
      "model-failed",
      "scheduled-notification",
      "read-write-side-effects",
      "serial-write-side-effects",
      "service-session-resume",
    ]);
  });
});
