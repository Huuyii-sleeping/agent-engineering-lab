import type { ObservabilityServiceLike, PendingQueryNotifications } from "../services/index.js";

type ScheduledNotification = PendingQueryNotifications["scheduled"][number];
type BackgroundNotification = PendingQueryNotifications["background"][number];
type TeamNotification = PendingQueryNotifications["team"][number];

export async function recordScheduledNotificationEvents(input: {
  notifications: ScheduledNotification[];
  observabilityService: ObservabilityServiceLike;
  traceId: string;
}): Promise<void> {
  for (const item of input.notifications) {
    await input.observabilityService.recordEvent(
      "notification",
      {
        source: "schedule",
        scheduleId: item.scheduleId,
        firedAt: item.firedAt,
        recurring: item.recurring,
        prompt: item.prompt,
      },
      { traceId: input.traceId },
    );
  }
}

export async function recordBackgroundNotificationEvents(input: {
  notifications: BackgroundNotification[];
  observabilityService: ObservabilityServiceLike;
  traceId: string;
}): Promise<void> {
  for (const item of input.notifications) {
    await input.observabilityService.recordEvent(
      "notification",
      {
        source: "background",
        taskId: item.taskId,
        status: item.status,
        command: item.command,
        exitCode: item.exitCode,
      },
      { traceId: input.traceId },
    );
  }
}

export async function recordTeamNotificationEvents(input: {
  notifications: TeamNotification[];
  observabilityService: ObservabilityServiceLike;
  traceId: string;
}): Promise<void> {
  for (const item of input.notifications) {
    await input.observabilityService.recordEvent(
      "notification",
      {
        source: "team",
        teammateId: item.teammateId,
        teammateName: item.teammateName,
        messageType: item.messageType,
        requestId: item.requestId ?? null,
        content: item.content,
      },
      { traceId: input.traceId },
    );
  }
}
