import { describe, expect, it } from "vitest";
import { cutBackgroundOutput, taskSnapshot, type BackgroundTask } from "../../../src/tools/background-task-types.js";

describe("tools/background-task-types", () => {
  it("cuts long output and keeps short output intact", () => {
    expect(cutBackgroundOutput("short", 10)).toBe("short");
    expect(cutBackgroundOutput("abcdefghijk", 5)).toBe("abcde...");
  });

  it("builds stable task snapshots", () => {
    const task: BackgroundTask = {
      id: 7,
      command: "echo hi",
      status: "completed",
      traceId: null,
      startedAt: 1,
      finishedAt: 2,
      exitCode: 0,
      stdout: "hello",
      stderr: "",
    };

    expect(taskSnapshot(task)).toEqual({
      id: 7,
      command: "echo hi",
      status: "completed",
      startedAt: 1,
      finishedAt: 2,
      exitCode: 0,
      stdout: "hello",
      stderr: "",
    });
  });
});
