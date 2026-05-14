import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationServiceLike } from "../../../src/services/notification-service.js";
import type { ObservabilityServiceLike } from "../../../src/services/observability-service.js";
import { collectDynamicSystemMessages } from "../../../src/runtime/query-notifications.js";

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

function createNotificationService(): NotificationServiceLike {
  return {
    drainPendingQueryNotifications: vi.fn(async () => ({
      scheduled: [],
      subagent: [],
      background: [],
      team: [],
    })),
  };
}

describe("runtime/query-notifications", () => {
  let notificationService: NotificationServiceLike;

  beforeEach(() => {
    notificationService = createNotificationService();
  });

  it("preserves seed system messages when no notifications are pending", async () => {
    const observabilityService = createObservabilityService();
    const messages = await collectDynamicSystemMessages({
      traceId: "trace_test",
      notificationService,
      observabilityService,
      seedMessages: ["seed"],
    });

    expect(messages).toEqual(["seed"]);
  });

  it("collects notification reminders and records auditable notification events", async () => {
    const observabilityService = createObservabilityService();
    vi.mocked(notificationService.drainPendingQueryNotifications).mockResolvedValue({
      scheduled: [
        {
          id: "sched_evt_1",
          scheduleId: "sch_1",
          firedAt: 1000,
          recurring: true,
          prompt: "follow up now",
        },
      ],
      subagent: [
        { agentId: 7, agentName: "worker", status: "completed", updatedAt: 2000, output: "done" },
      ],
      background: [
        {
          taskId: 3,
          status: "failed",
          command: "npm test",
          finishedAt: 3000,
          exitCode: 1,
          stdout: "",
          stderr: "boom",
        },
      ],
      team: [
        {
          teammateId: 5,
          teammateName: "alice",
          messageType: "message",
          from: "bob",
          requestId: undefined,
          createdAt: 4000,
          content: "please review this",
        },
      ],
    });

    const messages = await collectDynamicSystemMessages({
      traceId: "trace_test",
      notificationService,
      observabilityService,
    });

    expect(messages).toHaveLength(4);
    expect(messages[0]).toContain("<scheduled_prompt");
    expect(messages[1]).toContain("<subagent_notifications>");
    expect(messages[2]).toContain("<background_notifications>");
    expect(messages[3]).toContain("<team_notifications>");
    expect(observabilityService.recordEvent).toHaveBeenCalledTimes(3);
  });
});
