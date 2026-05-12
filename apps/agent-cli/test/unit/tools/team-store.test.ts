import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TeamStore } from "../../../src/tools/team-store.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function makeTeamRoot(): Promise<string> {
  tempDir = await mkdtemp(path.join(tmpdir(), "team-store-test-"));
  const teamRoot = path.join(tempDir, ".team");
  await mkdir(teamRoot, { recursive: true });
  return teamRoot;
}

describe("tools/team-store", () => {
  it("keeps backward-compatible teammate and request reads", async () => {
    const teamRoot = await makeTeamRoot();
    await writeFile(
      path.join(teamRoot, "teammates.json"),
      `${JSON.stringify([{ id: 1, name: "alice", status: "unexpected", updatedAt: "bad" }])}\n`,
      "utf8",
    );
    await writeFile(
      path.join(teamRoot, "requests.json"),
      `${JSON.stringify([{ request_id: "req_1", to: "alice", status: "unexpected", payload: "plan" }])}\n`,
      "utf8",
    );

    const store = new TeamStore(teamRoot);

    await expect(store.loadTeammates()).resolves.toMatchObject([
      { schemaVersion: 1, id: 1, name: "alice", status: "idle" },
    ]);
    await expect(store.loadRequests()).resolves.toMatchObject([
      {
        schemaVersion: 1,
        request_id: "req_1",
        type: "plan_approval",
        from: "main",
        to: "alice",
        status: "pending",
        payload: "plan",
      },
    ]);
  });
});
