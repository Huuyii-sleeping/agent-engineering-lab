import type { NotificationServiceLike, ObservabilityServiceLike } from "../services/index.js";
import {
  buildBackgroundNotificationsSystemMessage,
  buildScheduledPromptSystemMessage,
  buildSubagentNotificationsSystemMessage,
  buildTeamNotificationsSystemMessage,
  formatBackgroundNotificationSummary,
  formatScheduledNotificationSummary,
  formatSubagentNotificationSummary,
  formatTeamNotificationSummary,
} from "./query-notification-formatters.js";
import {
  recordBackgroundNotificationEvents,
  recordScheduledNotificationEvents,
  recordTeamNotificationEvents,
} from "./query-notification-recorders.js";

type CollectDynamicSystemMessagesOptions = {
  traceId: string;
  notificationService: NotificationServiceLike;
  observabilityService: ObservabilityServiceLike;
  seedMessages?: string[];
  includeScheduled?: boolean;
};

export async function collectDynamicSystemMessages(
  opts: CollectDynamicSystemMessagesOptions,
): Promise<string[]> {
  const dynamicSystemMessages = [...(opts.seedMessages ?? [])];
  const notifications = await opts.notificationService.drainPendingQueryNotifications({
    includeScheduled: opts.includeScheduled,
  });

  const scheduledNotifications = notifications.scheduled;
  if (scheduledNotifications.length > 0) {
    const summaryLines = scheduledNotifications.map((item) =>
      formatScheduledNotificationSummary(item),
    );
    dynamicSystemMessages.push(buildScheduledPromptSystemMessage(scheduledNotifications));
    console.log(`\u001b[36m[scheduled prompts]\u001b[0m\n${summaryLines.join("\n")}`);
    await recordScheduledNotificationEvents({
      notifications: scheduledNotifications,
      observabilityService: opts.observabilityService,
      traceId: opts.traceId,
    });
  }

  const subagentNotifications = notifications.subagent;
  if (subagentNotifications.length > 0) {
    const summaryLines = subagentNotifications.map((item) =>
      formatSubagentNotificationSummary(item),
    );
    dynamicSystemMessages.push(buildSubagentNotificationsSystemMessage(subagentNotifications));
    console.log(`\u001b[36m[subagent notifications]\u001b[0m\n${summaryLines.join("\n")}`);
  }

  const backgroundNotifications = notifications.background;
  if (backgroundNotifications.length > 0) {
    const summaryLines = backgroundNotifications.map((item) =>
      formatBackgroundNotificationSummary(item),
    );
    dynamicSystemMessages.push(buildBackgroundNotificationsSystemMessage(backgroundNotifications));
    console.log(`\u001b[36m[background notifications]\u001b[0m\n${summaryLines.join("\n")}`);
    await recordBackgroundNotificationEvents({
      notifications: backgroundNotifications,
      observabilityService: opts.observabilityService,
      traceId: opts.traceId,
    });
  }

  const teamNotifications = notifications.team;
  if (teamNotifications.length > 0) {
    const summaryLines = teamNotifications.map((item) => formatTeamNotificationSummary(item));
    dynamicSystemMessages.push(buildTeamNotificationsSystemMessage(teamNotifications));
    console.log(`\u001b[36m[team notifications]\u001b[0m\n${summaryLines.join("\n")}`);
    await recordTeamNotificationEvents({
      notifications: teamNotifications,
      observabilityService: opts.observabilityService,
      traceId: opts.traceId,
    });
  }

  return dynamicSystemMessages;
}
