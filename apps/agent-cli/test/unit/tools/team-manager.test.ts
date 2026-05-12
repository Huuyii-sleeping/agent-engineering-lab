import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TeamManager } from "../../../src/tools/team-manager.js";
import type { TeamMessage, TeamRequest, Teammate } from "../../../src/tools/team-types.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function makeManager(): Promise<TeamManager> {
  tempDir = await mkdtemp(path.join(tmpdir(), "team-manager-test-"));
  return new TeamManager(path.join(tempDir, ".team"));
}

describe("tools/team-manager", () => {
  it("delivers direct and broadcast messages while draining notifications", async () => {
    const manager = await makeManager();
    const alice = JSON.parse(await manager.addTeammate("alice")) as { teammate: Teammate };
    const bob = JSON.parse(await manager.addTeammate("bob")) as { teammate: Teammate };

    const status = JSON.parse(await manager.setStatus(alice.teammate.id, "working")) as { teammate: Teammate };
    expect(status.teammate).toMatchObject({ id: alice.teammate.id, status: "working", schemaVersion: 2 });

    const direct = JSON.parse(await manager.sendMessage(alice.teammate.id, "hello", "main")) as {
      delivered: number;
      message: TeamMessage;
    };
    expect(direct.delivered).toBe(1);
    expect(direct.message).toMatchObject({ from: "main", to: "alice", type: "message", content: "hello" });

    const broadcast = JSON.parse(await manager.broadcast("standup", "lead")) as { delivered: number };
    expect(broadcast.delivered).toBe(2);

    const aliceInbox = JSON.parse(await manager.readInbox(alice.teammate.id)) as { messages: TeamMessage[] };
    expect(aliceInbox.messages.map((message) => message.type)).toEqual(["message", "broadcast"]);

    const bobInbox = JSON.parse(await manager.readInbox(bob.teammate.id)) as { messages: TeamMessage[] };
    expect(bobInbox.messages).toMatchObject([{ type: "broadcast", content: "standup" }]);

    const notifications = manager.drainNotifications();
    expect(notifications.map((notification) => notification.messageType)).toEqual(["message", "broadcast", "broadcast"]);
    expect(manager.drainNotifications()).toEqual([]);
  });

  it("keeps shutdown and plan approval request response flow stable", async () => {
    const manager = await makeManager();
    const teammate = JSON.parse(await manager.addTeammate("reviewer")) as { teammate: Teammate };

    const shutdown = JSON.parse(
      await manager.createProtocolRequest("shutdown_request", teammate.teammate.id, "done for today", "main"),
    ) as { request: TeamRequest; message: TeamMessage };
    expect(shutdown.request).toMatchObject({ type: "shutdown_request", status: "pending", to: "reviewer" });
    expect(shutdown.message).toMatchObject({
      type: "shutdown_request",
      request_id: shutdown.request.request_id,
      content: "done for today",
    });

    const shutdownResponse = JSON.parse(
      await manager.respondProtocolRequest("shutdown_request", shutdown.request.request_id, true, "ok", "reviewer"),
    ) as { request: TeamRequest; message: TeamMessage };
    expect(shutdownResponse.request.status).toBe("approved");
    expect(shutdownResponse.message).toMatchObject({
      type: "shutdown_response",
      content: "ok",
      request_id: shutdown.request.request_id,
    });

    const plan = JSON.parse(
      await manager.createProtocolRequest("plan_approval", teammate.teammate.id, "ship plan", "main"),
    ) as { request: TeamRequest };
    const rejected = JSON.parse(
      await manager.respondProtocolRequest("plan_approval", plan.request.request_id, false, "", "reviewer"),
    ) as { request: TeamRequest; message: TeamMessage };
    expect(rejected.request.status).toBe("rejected");
    expect(rejected.message).toMatchObject({ type: "plan_approval_response", content: "rejected" });

    const requests = JSON.parse(await manager.listRequests()) as { requests: TeamRequest[] };
    expect(requests.requests.map((request) => request.status)).toEqual(["approved", "rejected"]);
  });
});
