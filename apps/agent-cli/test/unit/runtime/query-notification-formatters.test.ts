import { describe, expect, it } from "vitest";
import {
  buildBackgroundNotificationsSystemMessage,
  buildScheduledPromptSystemMessage,
  buildSubagentNotificationsSystemMessage,
  buildTeamNotificationsSystemMessage,
  formatBackgroundNotificationSummary,
  formatScheduledNotificationSummary,
  formatSubagentNotificationSummary,
  formatTeamNotificationSummary,
} from "../../../src/runtime/query-notification-formatters.js";

describe("runtime/query-notification-formatters", () => {
  it("formats scheduled prompt summaries and system messages without changing wording", () => {
    const item = {
      id: "evt_1",
      scheduleId: "sch_1",
      firedAt: 1000,
      recurring: false,
      prompt: "run the release check",
    };

    expect(formatScheduledNotificationSummary(item)).toBe(
      "schedule#sch_1 fired_at_ms=1000; prompt=run the release check",
    );
    expect(buildScheduledPromptSystemMessage([item])).toBe(
      '<scheduled_prompt id="sch_1" fired_at_ms="1000" recurring="false">\nrun the release check\n</scheduled_prompt>\n<scheduled_prompt_instruction>Treat each scheduled_prompt as a user intent that became due now. Handle it in this round.</scheduled_prompt_instruction>',
    );
  });

  it("formats subagent background and team notification messages", () => {
    expect(
      formatSubagentNotificationSummary({
        agentId: 7,
        agentName: "worker",
        status: "completed",
        updatedAt: 2000,
        output: "done",
      }),
    ).toBe("agent#7(worker) updated_at_ms=2000; output=done");
    expect(
      buildSubagentNotificationsSystemMessage([
        {
          agentId: 7,
          agentName: "worker",
          status: "failed",
          updatedAt: 2000,
          error: "failed",
        },
      ]),
    ).toBe("<subagent_notifications>\nagent#7(worker) updated_at_ms=2000; error=failed\n</subagent_notifications>");

    const background = {
      taskId: 3,
      status: "failed" as const,
      command: "npm test",
      finishedAt: 3000,
      exitCode: 1,
      stdout: "",
      stderr: "boom",
    };
    expect(formatBackgroundNotificationSummary(background)).toBe(
      "task#3 finished_at_ms=3000; command=npm test; stderr=boom",
    );
    expect(buildBackgroundNotificationsSystemMessage([background])).toBe(
      "<background_notifications>\ntask#3 finished_at_ms=3000; command=npm test; stderr=boom\n</background_notifications>",
    );

    const team = {
      teammateId: 5,
      teammateName: "alice",
      messageType: "message" as const,
      from: "bob",
      requestId: "req_1",
      createdAt: 4000,
      content: "please review this",
    };
    expect(formatTeamNotificationSummary(team)).toBe(
      "to#5(alice) message from=bob request_id=req_1 created_at_ms=4000: please review this",
    );
    expect(buildTeamNotificationsSystemMessage([team])).toBe(
      "<team_notifications>\nto#5(alice) message from=bob request_id=req_1 created_at_ms=4000: please review this\n</team_notifications>",
    );
  });
});
