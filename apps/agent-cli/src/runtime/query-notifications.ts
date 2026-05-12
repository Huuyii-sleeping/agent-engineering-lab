import type { NotificationServiceLike, ObservabilityServiceLike } from "../services/index.js";

type CollectDynamicSystemMessagesOptions = {
  traceId: string;
  notificationService: NotificationServiceLike;
  observabilityService: ObservabilityServiceLike;
  seedMessages?: string[];
};

function summarizePrompt(value: string, max = 160): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export async function collectDynamicSystemMessages(
  opts: CollectDynamicSystemMessagesOptions,
): Promise<string[]> {
  const dynamicSystemMessages = [...(opts.seedMessages ?? [])];
  const notifications = await opts.notificationService.drainPendingQueryNotifications();

  const scheduledNotifications = notifications.scheduled;
  if (scheduledNotifications.length > 0) {
    const summaryLines = scheduledNotifications.map((item) => {
      const preview = summarizePrompt(item.prompt);
      return `schedule#${item.scheduleId} fired_at_ms=${item.firedAt}; prompt=${preview}`;
    });
    const blocks = scheduledNotifications
      .map(
        (item) =>
          `<scheduled_prompt id="${item.scheduleId}" fired_at_ms="${item.firedAt}" recurring="${item.recurring}">\n${item.prompt}\n</scheduled_prompt>`,
      )
      .join("\n");
    dynamicSystemMessages.push(
      `${blocks}\n<scheduled_prompt_instruction>Treat each scheduled_prompt as a user intent that became due now. Handle it in this round.</scheduled_prompt_instruction>`,
    );
    console.log(`\u001b[36m[scheduled prompts]\u001b[0m\n${summaryLines.join("\n")}`);
    for (const item of scheduledNotifications) {
      await opts.observabilityService.recordEvent(
        "notification",
        {
          source: "schedule",
          scheduleId: item.scheduleId,
          firedAt: item.firedAt,
          recurring: item.recurring,
          prompt: item.prompt,
        },
        { traceId: opts.traceId },
      );
    }
  }

  const subagentNotifications = notifications.subagent;
  if (subagentNotifications.length > 0) {
    const summaryLines = subagentNotifications.map((item) => {
      const output = typeof item.output === "string" ? item.output.slice(0, 200) : "";
      const error = typeof item.error === "string" ? item.error.slice(0, 200) : "";
      if (item.status === "completed") {
        return `agent#${item.agentId}(${item.agentName}) updated_at_ms=${item.updatedAt}; output=${output}`;
      }
      return `agent#${item.agentId}(${item.agentName}) updated_at_ms=${item.updatedAt}; error=${error}`;
    });
    dynamicSystemMessages.push(
      `<subagent_notifications>\n${summaryLines.join("\n")}\n</subagent_notifications>`,
    );
    console.log(`\u001b[36m[subagent notifications]\u001b[0m\n${summaryLines.join("\n")}`);
  }

  const backgroundNotifications = notifications.background;
  if (backgroundNotifications.length > 0) {
    const summaryLines = backgroundNotifications.map((item) => {
      const out = item.stdout ? item.stdout.slice(0, 160) : "";
      const err = item.stderr ? item.stderr.slice(0, 160) : "";
      return item.status === "completed"
        ? `task#${item.taskId} finished_at_ms=${item.finishedAt}; command=${item.command}; stdout=${out}`
        : `task#${item.taskId} finished_at_ms=${item.finishedAt}; command=${item.command}; stderr=${err}`;
    });
    dynamicSystemMessages.push(
      `<background_notifications>\n${summaryLines.join("\n")}\n</background_notifications>`,
    );
    console.log(`\u001b[36m[background notifications]\u001b[0m\n${summaryLines.join("\n")}`);
    for (const item of backgroundNotifications) {
      await opts.observabilityService.recordEvent(
        "notification",
        {
          source: "background",
          taskId: item.taskId,
          status: item.status,
          command: item.command,
          exitCode: item.exitCode,
        },
        { traceId: opts.traceId },
      );
    }
  }

  const teamNotifications = notifications.team;
  if (teamNotifications.length > 0) {
    const summaryLines = teamNotifications.map((item) => {
      const content = item.content.slice(0, 120);
      const request = item.requestId ? ` request_id=${item.requestId}` : "";
      return `to#${item.teammateId}(${item.teammateName}) ${item.messageType} from=${item.from}${request} created_at_ms=${item.createdAt}: ${content}`;
    });
    dynamicSystemMessages.push(
      `<team_notifications>\n${summaryLines.join("\n")}\n</team_notifications>`,
    );
    console.log(`\u001b[36m[team notifications]\u001b[0m\n${summaryLines.join("\n")}`);
    for (const item of teamNotifications) {
      await opts.observabilityService.recordEvent(
        "notification",
        {
          source: "team",
          teammateId: item.teammateId,
          teammateName: item.teammateName,
          messageType: item.messageType,
          requestId: item.requestId ?? null,
          content: item.content,
        },
        { traceId: opts.traceId },
      );
    }
  }

  return dynamicSystemMessages;
}
