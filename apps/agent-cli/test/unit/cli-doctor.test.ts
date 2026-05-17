import { afterEach, describe, expect, it } from "vitest";
import { collectCliStatusSnapshot, runCliDoctor } from "../../src/cli/doctor.js";
import { resetCliUiForTest } from "../../src/cli/ui.js";

const originalModelId = process.env.MODEL_ID;

afterEach(() => {
  if (originalModelId === undefined) {
    delete process.env.MODEL_ID;
  } else {
    process.env.MODEL_ID = originalModelId;
  }
  resetCliUiForTest();
});

describe("cli-doctor", () => {
  it("reports missing MODEL_ID as an error", async () => {
    delete process.env.MODEL_ID;
    const report = await runCliDoctor();
    const modelCheck = report.checks.find((check) => check.id === "model-id");
    const memoryCheck = report.checks.find((check) => check.id === "memory");

    expect(modelCheck).toMatchObject({
      severity: "error",
      suggestion: "set MODEL_ID before running natural-language agent queries",
    });
    expect(memoryCheck).toMatchObject({
      severity: "pass",
    });
    expect(memoryCheck?.reason).toContain("reserved_gaps=");
  });

  it("collects runtime status using provided tool metadata", async () => {
    process.env.MODEL_ID = "gpt-test";
    const snapshot = await collectCliStatusSnapshot({
      mode: "interactive",
      activeSessionId: "s01",
      sessionCount: 2,
      bridgeEndpoint: "/events",
      toolMetadata: [
        { name: "read_file", target: "base", description: "Read" },
        { name: "mcp__demo__echo", target: "mcp", description: "Echo" },
      ],
    });

    expect(snapshot).toMatchObject({
      model: "gpt-test",
      activeSessionId: "s01",
      sessionCount: 2,
      toolCount: 2,
      mcpToolCount: 1,
      bridgeEndpoint: "/events",
      permissionMode: "default",
    });
    expect(snapshot.workspaceRoots[0]).toContain(process.cwd());
  });
});
