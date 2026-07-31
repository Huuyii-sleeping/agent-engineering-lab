import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentVersion } from "@orbit/workflow-core";
import { SopDatabase } from "../../../src/sops/sop-database.js";
import { SqliteAgentVersionRepository } from "../../../src/agents/sqlite-agent-version.repository.js";

const roots: string[] = [];

function snapshot(agentProfileId: string, name: string): Omit<AgentVersion, "id" | "version"> {
  return {
    agentProfileId,
    contentHash: `${agentProfileId}-${name}-hash`,
    name,
    description: `${name} description`,
    instructions: [`${name} instructions`],
    toolPolicy: { allowedToolIds: [] },
    skillPolicy: { bindings: [] },
    outputSchema: { type: "object" },
    createdBy: "tester",
    releaseNotes: "",
    createdAt: Date.now(),
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SqliteAgentVersionRepository", () => {
  it("追加不可变版本并通过 profile/version 双 identity 解析", async () => {
    const root = await mkdtemp(join(tmpdir(), "orbit-agent-version-repository-"));
    roots.push(root);
    const database = new SopDatabase({ sopDataRoot: root });
    try {
      const repository = new SqliteAgentVersionRepository(database);
      const first = repository.publish(snapshot("profile-1", "Agent v1"));
      const second = repository.publish(snapshot("profile-1", "Agent v2"));
      const other = repository.publish(snapshot("profile-2", "Other Agent"));

      expect([first.version, second.version, other.version]).toEqual([1, 2, 1]);
      expect(repository.list("profile-1").map((item) => item.id)).toEqual([second.id, first.id]);
      expect(repository.resolvePublishedVersion("profile-1", first.id)).toEqual(first);
      expect(repository.resolvePublishedVersion("profile-2", first.id)).toBeUndefined();
      expect(repository.getById(other.id)).toEqual(other);

      expect(() => database.database.prepare("update agent_versions set name = ? where id = ?").run("mutated", first.id)).toThrow(/immutable/i);
      expect(() => database.database.prepare("delete from agent_versions where id = ?").run(first.id)).toThrow(/immutable/i);
      expect(repository.getById(first.id)).toEqual(first);
    } finally {
      database.onModuleDestroy();
    }
  });
});
