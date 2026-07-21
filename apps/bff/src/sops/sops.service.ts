import { Inject, Injectable } from "@nestjs/common";
import {
  createContentHash,
  isWorkflowDraft,
  migrateSopDraftV1,
  normalizeWorkflowContent,
  normalizeWorkflowDraft,
  stableSerialize,
  validateWorkflowDraft,
  type WorkflowDraft,
  type WorkflowVersion,
} from "@orbit/workflow-core";
import { randomUUID } from "node:crypto";
import { SopDatabase } from "./sop-database.js";
import { SopNotFoundError, SopRevisionConflictError, SopValidationError } from "./sops.errors.js";
import { SqliteSopsRepository } from "./sqlite-sops.repository.js";
import type {
  PublishSopInput,
  SaveSopDraftInput,
  SaveSopTemplateInput,
  SopImportPreview,
  SopTemplate,
  SopVersionDiff,
  SopVersionSummary,
} from "./sops.types.js";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown, fallback = "", limit = 240): string {
  return typeof value === "string" ? (value.trim() || fallback).slice(0, limit) : fallback;
}

function snapshotName(version: WorkflowVersion): string {
  return cleanText(asObject(version.metadata).name, `工作流 v${version.version}`, 120);
}

function snapshotSummary(version: WorkflowVersion): string {
  return cleanText(asObject(version.metadata).summary, "从不可变版本创建的草稿。", 500);
}

function changedIds<T extends { id: string }>(from: T[], to: T[]): { added: string[]; removed: string[]; changed: string[] } {
  const fromMap = new Map(from.map((item) => [item.id, item]));
  const toMap = new Map(to.map((item) => [item.id, item]));
  return {
    added: [...toMap.keys()].filter((id) => !fromMap.has(id)).sort(),
    removed: [...fromMap.keys()].filter((id) => !toMap.has(id)).sort(),
    changed: [...toMap.keys()].filter((id) => fromMap.has(id) && stableSerialize(fromMap.get(id)) !== stableSerialize(toMap.get(id))).sort(),
  };
}

/** SOP 业务规则：草稿并发、发布预检、版本差异、导入迁移和模板生命周期。 */
@Injectable()
export class SopsService {
  constructor(
    @Inject(SqliteSopsRepository) private readonly repository: SqliteSopsRepository,
    @Inject(SopDatabase) private readonly storage: SopDatabase,
  ) {}

  listDrafts(): WorkflowDraft[] {
    return this.repository.listDrafts();
  }

  getDraft(id: string): WorkflowDraft {
    const draft = this.repository.getDraft(id);
    if (!draft) throw new SopNotFoundError("草稿", id);
    return draft;
  }

  createDraft(value: unknown): WorkflowDraft {
    const { draft } = this.parseImport(value);
    if (this.repository.getDraft(draft.id)) throw new SopValidationError(`草稿 ${draft.id} 已存在。`, { id: draft.id });
    const now = Date.now();
    return this.repository.createDraft(normalizeWorkflowDraft({ ...draft, revision: 0, createdAt: now, updatedAt: now }));
  }

  saveDraft(id: string, input: SaveSopDraftInput): WorkflowDraft {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new SopValidationError("expectedRevision 必须是非负整数。 ");
    if (!isWorkflowDraft(input.draft)) throw new SopValidationError("草稿必须是 workflow v2 结构。 ");
    return this.repository.updateDraft(id, input.expectedRevision, input.draft);
  }

  deleteDraft(id: string, expectedRevision?: number): void {
    if (!this.repository.deleteDraft(id, expectedRevision)) throw new SopNotFoundError("草稿", id);
  }

  async publish(id: string, input: PublishSopInput): Promise<WorkflowVersion> {
    const draft = this.getDraft(id);
    if (draft.revision !== input.expectedRevision) throw new SopRevisionConflictError(draft);
    const validation = validateWorkflowDraft(draft);
    if (!validation.ok) throw new SopValidationError("发布前校验未通过。", { diagnostics: validation.diagnostics });
    const contentHash = await createContentHash(normalizeWorkflowContent(draft));
    return this.repository.publishVersion({
      schemaVersion: draft.schemaVersion,
      workflowId: draft.id,
      contentHash,
      createdAt: Date.now(),
      createdBy: cleanText(input.createdBy, "local-user", 80),
      releaseNotes: cleanText(input.releaseNotes, "", 500),
      nodes: draft.nodes,
      edges: draft.edges,
      metadata: { ...draft.metadata, name: draft.name, summary: draft.summary, sourceRevision: draft.revision },
    });
  }

  listVersions(workflowId: string): SopVersionSummary[] {
    this.getDraft(workflowId);
    return this.repository.listVersions(workflowId);
  }

  getVersion(workflowId: string, versionId: string): WorkflowVersion {
    const version = this.repository.getVersion(workflowId, versionId);
    if (!version) throw new SopNotFoundError("版本", versionId);
    return version;
  }

  diffVersions(workflowId: string, fromVersionId: string, toVersionId: string): SopVersionDiff {
    const from = this.getVersion(workflowId, fromVersionId);
    const to = this.getVersion(workflowId, toVersionId);
    const fromMetadata = asObject(from.metadata);
    const toMetadata = asObject(to.metadata);
    return {
      fromVersionId,
      toVersionId,
      nodes: changedIds(from.nodes, to.nodes),
      edges: changedIds(from.edges, to.edges),
      fields: {
        nameChanged: fromMetadata.name !== toMetadata.name,
        summaryChanged: fromMetadata.summary !== toMetadata.summary,
        metadataChanged: stableSerialize(fromMetadata) !== stableSerialize(toMetadata),
      },
    };
  }

  createDraftFromVersion(workflowId: string, versionId: string): WorkflowDraft {
    const version = this.getVersion(workflowId, versionId);
    const now = Date.now();
    return this.repository.createDraft({
      schemaVersion: version.schemaVersion,
      id: randomUUID(),
      name: `${snapshotName(version)} · 恢复草稿`,
      summary: snapshotSummary(version),
      revision: 0,
      createdAt: now,
      updatedAt: now,
      nodes: version.nodes,
      edges: version.edges,
      metadata: { sourceWorkflowId: workflowId, sourceVersionId: versionId },
    });
  }

  previewImport(value: unknown): SopImportPreview {
    const parsed = this.parseImport(value);
    const validation = validateWorkflowDraft(parsed.draft);
    return {
      draft: parsed.draft,
      diagnostics: validation.diagnostics,
      migrated: parsed.migrated,
      publishable: validation.ok,
    };
  }

  importDraft(value: unknown): WorkflowDraft {
    const parsed = this.parseImport(value);
    const now = Date.now();
    const id = this.repository.getDraft(parsed.draft.id) ? randomUUID() : parsed.draft.id;
    return this.repository.createDraft({ ...parsed.draft, id, revision: 0, createdAt: now, updatedAt: now });
  }

  exportDraft(id: string): WorkflowDraft {
    return this.getDraft(id);
  }

  saveTemplate(input: SaveSopTemplateInput): SopTemplate {
    const version = this.repository.getVersionById(input.sourceVersionId);
    if (!version) throw new SopNotFoundError("版本", input.sourceVersionId);
    const now = Date.now();
    const templateId = input.id || randomUUID();
    const previous = this.repository.getTemplate(templateId);
    return this.repository.createTemplate({
      id: templateId,
      version: 0,
      name: cleanText(input.name, snapshotName(version), 120),
      summary: cleanText(input.summary, snapshotSummary(version), 500),
      sourceWorkflowId: version.workflowId,
      sourceVersionId: version.id,
      parameterSchema: asObject(input.parameterSchema),
      draft: {
        schemaVersion: version.schemaVersion,
        id: version.workflowId,
        name: snapshotName(version),
        summary: snapshotSummary(version),
        revision: 0,
        createdAt: version.createdAt,
        updatedAt: version.createdAt,
        nodes: version.nodes,
        edges: version.edges,
        metadata: version.metadata,
      },
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
  }

  listTemplates(): SopTemplate[] {
    return this.repository.listTemplates();
  }

  getTemplate(id: string, version?: number): SopTemplate {
    const template = this.repository.getTemplate(id, version);
    if (!template) throw new SopNotFoundError("模板", id);
    return template;
  }

  deleteTemplate(id: string): void {
    if (!this.repository.deleteTemplate(id)) throw new SopNotFoundError("模板", id);
  }

  createDraftFromTemplate(id: string, version: number | undefined, parameters: unknown): WorkflowDraft {
    const template = this.getTemplate(id, version);
    const now = Date.now();
    return this.repository.createDraft({
      ...template.draft,
      id: randomUUID(),
      name: template.name,
      summary: template.summary,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...template.draft.metadata,
        template: { id: template.id, version: template.version, parameters: asObject(parameters) },
      },
    });
  }

  storageHealth() {
    return this.storage.health();
  }

  async backup(label?: string): Promise<string> {
    return this.storage.backup(label);
  }

  async restore(fileName: string): Promise<void> {
    await this.storage.backup("before-restore");
    await this.storage.restore(fileName);
  }

  private parseImport(value: unknown): { draft: WorkflowDraft; migrated: boolean } {
    try {
      if (isWorkflowDraft(value)) return { draft: normalizeWorkflowDraft(value), migrated: false };
      return { draft: migrateSopDraftV1(value), migrated: true };
    } catch (error) {
      throw new SopValidationError(error instanceof Error ? error.message : "SOP 导入数据无效。 ");
    }
  }
}
