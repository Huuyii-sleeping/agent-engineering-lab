import { Inject, Injectable } from "@nestjs/common";
import { isWorkflowDraft, normalizeWorkflowDraft, type WorkflowDraft, type WorkflowVersion } from "@orbit/workflow-core";
import { randomUUID } from "node:crypto";
import { SopDatabase } from "./sop-database.js";
import { SopNotFoundError, SopRevisionConflictError, SopStorageError } from "./sops.errors.js";
import type { PublishVersionRecord, SopsRepository } from "./sops.repository.js";
import type { SopTemplate, SopVersionSummary } from "./sops.types.js";

type DraftRow = { content_json: string };
type VersionRow = { content_json: string };
type TemplateRow = {
  id: string;
  version: number;
  name: string;
  summary: string;
  source_workflow_id: string;
  source_version_id: string;
  parameter_schema_json: string;
  content_json: string;
  created_at: number;
  updated_at: number;
};

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new SopStorageError(`${label} 的 JSON 数据已损坏。`, { cause: String(error) });
  }
}

function parseDraft(raw: string): WorkflowDraft {
  const value = parseJson(raw, "SOP 草稿");
  if (!isWorkflowDraft(value)) throw new SopStorageError("SOP 草稿结构已损坏。 ");
  return normalizeWorkflowDraft(value);
}

function parseVersion(raw: string): WorkflowVersion {
  const value = parseJson(raw, "SOP 版本");
  if (!value || typeof value !== "object") throw new SopStorageError("SOP 版本结构已损坏。 ");
  return value as WorkflowVersion;
}

function templateFromRow(row: TemplateRow): SopTemplate {
  const parameterSchema = parseJson(row.parameter_schema_json, "SOP 模板参数");
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    summary: row.summary,
    sourceWorkflowId: row.source_workflow_id,
    sourceVersionId: row.source_version_id,
    parameterSchema: parameterSchema && typeof parameterSchema === "object" && !Array.isArray(parameterSchema) ? parameterSchema as Record<string, unknown> : {},
    draft: parseDraft(row.content_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** better-sqlite3 实现，所有发布和 revision 更新均在 SQLite 事务内完成。 */
@Injectable()
export class SqliteSopsRepository implements SopsRepository {
  constructor(@Inject(SopDatabase) private readonly storage: SopDatabase) {}

  listDrafts(): WorkflowDraft[] {
    const rows = this.storage.database.prepare("select content_json from sop_drafts order by updated_at desc").all() as DraftRow[];
    return rows.map((row) => parseDraft(row.content_json));
  }

  getDraft(id: string): WorkflowDraft | null {
    const row = this.storage.database.prepare("select content_json from sop_drafts where id = ?").get(id) as DraftRow | undefined;
    return row ? parseDraft(row.content_json) : null;
  }

  createDraft(draft: WorkflowDraft): WorkflowDraft {
    const normalized = normalizeWorkflowDraft(draft);
    this.storage.database.prepare(`
      insert into sop_drafts(id, revision, schema_version, name, summary, content_json, created_at, updated_at)
      values (@id, @revision, @schemaVersion, @name, @summary, @contentJson, @createdAt, @updatedAt)
    `).run({
      id: normalized.id,
      revision: normalized.revision,
      schemaVersion: normalized.schemaVersion,
      name: normalized.name,
      summary: normalized.summary,
      contentJson: JSON.stringify(normalized),
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    });
    return normalized;
  }

  updateDraft(id: string, expectedRevision: number, draft: WorkflowDraft): WorkflowDraft {
    const current = this.getDraft(id);
    if (!current) throw new SopNotFoundError("草稿", id);
    if (current.revision !== expectedRevision) throw new SopRevisionConflictError(current);
    const next = normalizeWorkflowDraft({
      ...draft,
      id,
      revision: expectedRevision + 1,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    });
    const result = this.storage.database.prepare(`
      update sop_drafts
      set revision = @revision,
          schema_version = @schemaVersion,
          name = @name,
          summary = @summary,
          content_json = @contentJson,
          updated_at = @updatedAt
      where id = @id and revision = @expectedRevision
    `).run({
      id,
      expectedRevision,
      revision: next.revision,
      schemaVersion: next.schemaVersion,
      name: next.name,
      summary: next.summary,
      contentJson: JSON.stringify(next),
      updatedAt: next.updatedAt,
    });
    if (result.changes !== 1) {
      const latest = this.getDraft(id);
      if (!latest) throw new SopNotFoundError("草稿", id);
      throw new SopRevisionConflictError(latest);
    }
    return next;
  }

  deleteDraft(id: string, expectedRevision?: number): boolean {
    if (expectedRevision !== undefined) {
      const current = this.getDraft(id);
      if (!current) return false;
      if (current.revision !== expectedRevision) throw new SopRevisionConflictError(current);
    }
    return this.storage.database.prepare("delete from sop_drafts where id = ?").run(id).changes === 1;
  }

  publishVersion(input: PublishVersionRecord): WorkflowVersion {
    return this.storage.database.transaction(() => {
      const next = this.storage.database.prepare("select coalesce(max(version), 0) + 1 as version from sop_versions where workflow_id = ?").get(input.workflowId) as { version: number };
      const version: WorkflowVersion = { ...input, id: randomUUID(), version: next.version };
      this.storage.database.prepare(`
        insert into sop_versions(id, workflow_id, version, schema_version, content_hash, created_by, release_notes, content_json, created_at)
        values (@id, @workflowId, @version, @schemaVersion, @contentHash, @createdBy, @releaseNotes, @contentJson, @createdAt)
      `).run({
        id: version.id,
        workflowId: version.workflowId,
        version: version.version,
        schemaVersion: version.schemaVersion,
        contentHash: version.contentHash,
        createdBy: version.createdBy,
        releaseNotes: version.releaseNotes ?? "",
        contentJson: JSON.stringify(version),
        createdAt: version.createdAt,
      });
      return version;
    })();
  }

  listVersions(workflowId: string): SopVersionSummary[] {
    const rows = this.storage.database.prepare("select content_json from sop_versions where workflow_id = ? order by version desc").all(workflowId) as VersionRow[];
    return rows.map((row) => {
      const version = parseVersion(row.content_json);
      const { nodes, edges, ...summary } = version;
      return { ...summary, nodeCount: nodes.length, edgeCount: edges.length };
    });
  }

  getVersion(workflowId: string, versionId: string): WorkflowVersion | null {
    const row = this.storage.database.prepare("select content_json from sop_versions where workflow_id = ? and id = ?").get(workflowId, versionId) as VersionRow | undefined;
    return row ? parseVersion(row.content_json) : null;
  }

  getVersionById(versionId: string): WorkflowVersion | null {
    const row = this.storage.database.prepare("select content_json from sop_versions where id = ?").get(versionId) as VersionRow | undefined;
    return row ? parseVersion(row.content_json) : null;
  }

  createTemplate(template: SopTemplate): SopTemplate {
    return this.storage.database.transaction(() => {
      const current = this.storage.database.prepare("select coalesce(max(version), 0) + 1 as version from sop_templates where id = ?").get(template.id) as { version: number };
      const next = { ...template, version: current.version, updatedAt: Date.now() };
      this.storage.database.prepare(`
        insert into sop_templates(id, version, name, summary, source_workflow_id, source_version_id, parameter_schema_json, content_json, created_at, updated_at)
        values (@id, @version, @name, @summary, @sourceWorkflowId, @sourceVersionId, @parameterSchema, @contentJson, @createdAt, @updatedAt)
      `).run({
        id: next.id,
        version: next.version,
        name: next.name,
        summary: next.summary,
        sourceWorkflowId: next.sourceWorkflowId,
        sourceVersionId: next.sourceVersionId,
        parameterSchema: JSON.stringify(next.parameterSchema),
        contentJson: JSON.stringify(next.draft),
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
      });
      return next;
    })();
  }

  listTemplates(): SopTemplate[] {
    const rows = this.storage.database.prepare(`
      select template.* from sop_templates template
      inner join (select id, max(version) as version from sop_templates group by id) latest
        on latest.id = template.id and latest.version = template.version
      order by template.updated_at desc
    `).all() as TemplateRow[];
    return rows.map(templateFromRow);
  }

  getTemplate(id: string, version?: number): SopTemplate | null {
    const row = version === undefined
      ? this.storage.database.prepare("select * from sop_templates where id = ? order by version desc limit 1").get(id) as TemplateRow | undefined
      : this.storage.database.prepare("select * from sop_templates where id = ? and version = ?").get(id, version) as TemplateRow | undefined;
    return row ? templateFromRow(row) : null;
  }

  deleteTemplate(id: string): boolean {
    return this.storage.database.prepare("delete from sop_templates where id = ?").run(id).changes > 0;
  }
}
