import { Inject, Injectable } from "@nestjs/common";
import type { AgentVersion } from "@orbit/workflow-core";
import { randomUUID } from "node:crypto";
import { SopDatabase } from "../sops/sop-database.js";
import { SopStorageError } from "../sops/sops.errors.js";
import type { AgentVersionRepository, PublishAgentVersionRecord } from "./agent-version.repository.js";

type AgentVersionRow = { snapshot_json: string };

function parseVersion(raw: string): AgentVersion {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("snapshot must be an object");
    return value as AgentVersion;
  } catch (error) {
    throw new SopStorageError("AgentVersion 快照 JSON 已损坏。", { cause: String(error) });
  }
}

/** 使用产品 SQLite 持久化不可变 AgentVersion。 */
@Injectable()
export class SqliteAgentVersionRepository implements AgentVersionRepository {
  constructor(@Inject(SopDatabase) private readonly storage: SopDatabase) {}

  publish(input: PublishAgentVersionRecord): AgentVersion {
    return this.storage.database.transaction(() => {
      const next = this.storage.database.prepare(`
        select coalesce(max(version), 0) + 1 as version
        from agent_versions
        where agent_profile_id = ?
      `).get(input.agentProfileId) as { version: number };
      const version: AgentVersion = { ...input, id: randomUUID(), version: next.version };
      this.storage.database.prepare(`
        insert into agent_versions(
          id, agent_profile_id, version, content_hash, name, description,
          snapshot_json, created_by, release_notes, created_at
        ) values (
          @id, @agentProfileId, @version, @contentHash, @name, @description,
          @snapshotJson, @createdBy, @releaseNotes, @createdAt
        )
      `).run({
        id: version.id,
        agentProfileId: version.agentProfileId,
        version: version.version,
        contentHash: version.contentHash,
        name: version.name,
        description: version.description,
        snapshotJson: JSON.stringify(version),
        createdBy: version.createdBy,
        releaseNotes: version.releaseNotes,
        createdAt: version.createdAt,
      });
      return version;
    })();
  }

  list(agentProfileId?: string): AgentVersion[] {
    const rows = agentProfileId
      ? this.storage.database.prepare(`
          select snapshot_json from agent_versions
          where agent_profile_id = ?
          order by version desc
        `).all(agentProfileId) as AgentVersionRow[]
      : this.storage.database.prepare(`
          select snapshot_json from agent_versions
          order by created_at desc, agent_profile_id, version desc
        `).all() as AgentVersionRow[];
    return rows.map((row) => parseVersion(row.snapshot_json));
  }

  getById(agentVersionId: string): AgentVersion | undefined {
    const row = this.storage.database.prepare("select snapshot_json from agent_versions where id = ?").get(agentVersionId) as AgentVersionRow | undefined;
    return row ? parseVersion(row.snapshot_json) : undefined;
  }

  resolvePublishedVersion(agentProfileId: string, agentVersionId: string): AgentVersion | undefined {
    const row = this.storage.database.prepare(`
      select snapshot_json from agent_versions
      where id = ? and agent_profile_id = ?
    `).get(agentVersionId, agentProfileId) as AgentVersionRow | undefined;
    return row ? parseVersion(row.snapshot_json) : undefined;
  }
}
