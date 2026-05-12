import {
  drainBackgroundNotifications,
  type BackgroundNotification,
} from "./tools/background-task.js";
import {
  drainScheduledNotifications,
  type ScheduledPromptNotification,
} from "./tools/scheduler.js";
import { drainSubagentNotifications, type SubagentNotification } from "./tools/subagent.js";
import { drainTeamNotifications, type TeamNotification } from "./tools/team.js";

export type PendingQueryNotifications = {
  scheduled: ScheduledPromptNotification[];
  subagent: SubagentNotification[];
  background: BackgroundNotification[];
  team: TeamNotification[];
};

export type NotificationServiceLike = {
  drainPendingQueryNotifications(): Promise<PendingQueryNotifications>;
};

export class NotificationService implements NotificationServiceLike {
  async drainPendingQueryNotifications(): Promise<PendingQueryNotifications> {
    return {
      scheduled: await drainScheduledNotifications(),
      subagent: drainSubagentNotifications(),
      background: drainBackgroundNotifications(),
      team: drainTeamNotifications(),
    };
  }
}

export const DEFAULT_NOTIFICATION_SERVICE = new NotificationService();
