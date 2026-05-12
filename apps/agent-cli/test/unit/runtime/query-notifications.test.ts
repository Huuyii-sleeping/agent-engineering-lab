import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObservabilityServiceLike } from "../../../src/observability-service.js";

vi.mock("../../../src/tools/scheduler.js", () => ({
  drainScheduledNotifications: vi.fn(async () => []),
}));

vi.mock("../../../src/tools/subagent.js", () => ({
  drainSubagentNotifications: vi.fn(() => []),
}));

vi.mock("../../../src/tools/background-task.js", () => ({
  drainBackgroundNotifications: vi.fn(() => []),
}));

vi.mock("../../../src/tools/team.js", () => ({
  drainTeamNotifications: vi.fn(() => []),
}));
import { collectDynamicSystemMessages } from "../../../src/runtime/query-notifications.js";
import { drainBackgroundNotifications } from "../../../src/tools/background-task.js";
import { drainScheduledNotifications } from "../../../src/tools/scheduler.js";
import { drainSubagentNotifications } from "../../../src/tools/subagent.js";
import { drainTeamNotifications } from "../../../src/tools/team.js";

function createObservabilityService(): ObservabilityServiceLike {
  return {
    createTraceId: vi.fn(() => "trace-test"),
    createSpanId: vi.fn(() => "span-test"),
    withExecutionContext: vi.fn(async (_context, fn: () => Promise<unknown>) => fn()),
    recordEvent: vi.fn(async () => ({
      schemaVersion: 1,
      id: "evt-test",
      at: 0,
      trace_id: "trace-test",
      span_id: null,
      kind: "notification",
      payload: {},
    })),
  };
}

describe("runtime/query-notifications", () => {
  beforeEach(() => {
    vi.mocked(drainScheduledNotifications).mockResolvedValue([]);
    vi.mocked(drainSubagentNotifications).mockReturnValue([]);
    vi.mocked(drainBackgroundNotifications).mockReturnValue([]);
    vi.mocked(drainTeamNotifications).mockReturnValue([]);
  });

  it("preserves seed system messages when no notifications are pending", async () => {
    const observabilityService = createObservabilityService();
    const messages = await collectDynamicSystemMessages({
      traceId: "trace_test",
      observabilityService,
      seedMessages: ["seed"],
    });

    expect(messages).toEqual(["seed"]);
  });

  it("collects notification reminders and records auditable notification events", async () => {
    const observabilityService = createObservabilityService();
    vi.mocked(drainScheduledNotifications).mockResolvedValue([
      { scheduleId: 1, firedAt: 1000, recurring: true, prompt: "follow up now" },
    ]);
    vi.mocked(drainSubagentNotifications).mockReturnValue([
      { agentId: 7, agentName: "worker", status: "completed", updatedAt: 2000, output: "done" },
    ]);
    vi.mocked(drainBackgroundNotifications).mockReturnValue([
      { taskId: 3, status: "failed", command: "npm test", finishedAt: 3000, exitCode: 1, stdout: "", stderr: "boom" },
    ]);
    vi.mocked(drainTeamNotifications).mockReturnValue([
      {
        teammateId: 5,
        teammateName: "alice",
        messageType: "message",
        from: "bob",
        requestId: null,
        createdAt: 4000,
        content: "please review this",
      },
    ]);

    const messages = await collectDynamicSystemMessages({ traceId: "trace_test", observabilityService });

    expect(messages).toHaveLength(4);
    expect(messages[0]).toContain("<scheduled_prompt");
    expect(messages[1]).toContain("<subagent_notifications>");
    expect(messages[2]).toContain("<background_notifications>");
    expect(messages[3]).toContain("<team_notifications>");
    expect(observabilityService.recordEvent).toHaveBeenCalledTimes(3);
  });
});
