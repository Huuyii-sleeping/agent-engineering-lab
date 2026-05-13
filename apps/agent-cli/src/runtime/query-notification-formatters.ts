import type { PendingQueryNotifications } from "../services/index.js";

type ScheduledNotification = PendingQueryNotifications["scheduled"][number];
type SubagentNotification = PendingQueryNotifications["subagent"][number];
type BackgroundNotification = PendingQueryNotifications["background"][number];
type TeamNotification = PendingQueryNotifications["team"][number];

export function summarizeNotificationText(value: string, max = 160): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function formatScheduledNotificationSummary(item: ScheduledNotification): string {
  const preview = summarizeNotificationText(item.prompt);
  return `schedule#${item.scheduleId} fired_at_ms=${item.firedAt}; prompt=${preview}`;
}

export function buildScheduledPromptSystemMessage(items: ScheduledNotification[]): string {
  const blocks = items
    .map(
      (item) =>
        `<scheduled_prompt id="${item.scheduleId}" fired_at_ms="${item.firedAt}" recurring="${item.recurring}">\n${item.prompt}\n</scheduled_prompt>`,
    )
    .join("\n");
  return `${blocks}\n<scheduled_prompt_instruction>Treat each scheduled_prompt as a user intent that became due now. Handle it in this round.</scheduled_prompt_instruction>`;
}

export function formatSubagentNotificationSummary(item: SubagentNotification): string {
  const output = typeof item.output === "string" ? item.output.slice(0, 200) : "";
  const error = typeof item.error === "string" ? item.error.slice(0, 200) : "";
  if (item.status === "completed") {
    return `agent#${item.agentId}(${item.agentName}) updated_at_ms=${item.updatedAt}; output=${output}`;
  }
  return `agent#${item.agentId}(${item.agentName}) updated_at_ms=${item.updatedAt}; error=${error}`;
}

export function buildSubagentNotificationsSystemMessage(items: SubagentNotification[]): string {
  const summaryLines = items.map((item) => formatSubagentNotificationSummary(item));
  return `<subagent_notifications>\n${summaryLines.join("\n")}\n</subagent_notifications>`;
}

export function formatBackgroundNotificationSummary(item: BackgroundNotification): string {
  const out = item.stdout ? item.stdout.slice(0, 160) : "";
  const err = item.stderr ? item.stderr.slice(0, 160) : "";
  return item.status === "completed"
    ? `task#${item.taskId} finished_at_ms=${item.finishedAt}; command=${item.command}; stdout=${out}`
    : `task#${item.taskId} finished_at_ms=${item.finishedAt}; command=${item.command}; stderr=${err}`;
}

export function buildBackgroundNotificationsSystemMessage(items: BackgroundNotification[]): string {
  const summaryLines = items.map((item) => formatBackgroundNotificationSummary(item));
  return `<background_notifications>\n${summaryLines.join("\n")}\n</background_notifications>`;
}

export function formatTeamNotificationSummary(item: TeamNotification): string {
  const content = item.content.slice(0, 120);
  const request = item.requestId ? ` request_id=${item.requestId}` : "";
  return `to#${item.teammateId}(${item.teammateName}) ${item.messageType} from=${item.from}${request} created_at_ms=${item.createdAt}: ${content}`;
}

export function buildTeamNotificationsSystemMessage(items: TeamNotification[]): string {
  const summaryLines = items.map((item) => formatTeamNotificationSummary(item));
  return `<team_notifications>\n${summaryLines.join("\n")}\n</team_notifications>`;
}
