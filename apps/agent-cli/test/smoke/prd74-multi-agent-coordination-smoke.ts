import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SubagentManager } from "../../src/tools/subagent-manager.js";
import type { SubagentExecutionResult } from "../../src/tools/subagent-types.js";
import type { SubagentExecutorLike } from "../../src/tools/subagent-executor.js";
import { TaskManager } from "../../src/tools/task-manager.js";
import { TaskStore } from "../../src/tools/task-store.js";
import { TeamManager } from "../../src/tools/team-manager.js";

class SmokeSubagentExecutor implements SubagentExecutorLike {
  async execute(): Promise<SubagentExecutionResult> {
    return { status: "completed", output: "worker done" };
  }
}

const root = await mkdtemp(path.join(tmpdir(), "prd74-multi-agent-"));

try {
  const subagents = new SubagentManager(new SmokeSubagentExecutor());
  const parent = JSON.parse(await subagents.spawn("lead", "coordinator")) as { agent: { id: number; role: string } };
  const child = JSON.parse(await subagents.spawn("reviewer", "reviewer", parent.agent.id)) as {
    agent: { id: number; role: string; parentAgentId: number };
  };

  assert.equal(parent.agent.role, "coordinator");
  assert.equal(child.agent.role, "reviewer");
  assert.equal(child.agent.parentAgentId, parent.agent.id);

  await subagents.send(child.agent.id, "review implementation");
  await subagents.wait(child.agent.id, 50);
  assert.equal(subagents.drainNotifications()[0]?.role, "reviewer");

  const team = new TeamManager(path.join(root, ".team"));
  const teammate = JSON.parse(await team.addTeammate("reviewer")) as { teammate: { id: number } };
  await team.sendMessage(teammate.teammate.id, "please review", "lead");
  await team.sendMessage(teammate.teammate.id, "second note", "lead");
  assert.equal(JSON.parse(await team.readInbox(teammate.teammate.id)).unreadCount, 2);
  await team.markInboxRead(teammate.teammate.id);
  assert.equal(JSON.parse(await team.readInbox(teammate.teammate.id)).unreadCount, 0);

  const tasks = new TaskManager(new TaskStore(path.join(root, ".tasks")));
  const task = JSON.parse(await tasks.create("review patch", "multi-agent handoff")) as { id: number };
  const claimed = JSON.parse(await tasks.claimTask(task.id, "reviewer")) as { task: { owner: string } };
  assert.equal(claimed.task.owner, "reviewer");
  assert.match(await tasks.listAll(), /owner=reviewer/);

  console.log("PRD-74 multi-agent coordination smoke passed");
} finally {
  await rm(root, { recursive: true, force: true });
}

