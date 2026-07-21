import type { WorkflowDiagnostic, WorkflowDraft, WorkflowVersion } from "@orbit/workflow-core";

/** 草稿创建输入。 */
export type CreateSopDraftInput = {
  draft: WorkflowDraft;
};

/** 带乐观并发 revision 的草稿保存输入。 */
export type SaveSopDraftInput = {
  expectedRevision: number;
  draft: WorkflowDraft;
};

/** 发布不可变版本的输入。 */
export type PublishSopInput = {
  expectedRevision: number;
  createdBy?: string;
  releaseNotes?: string;
};

/** 发布前预检结果。 */
export type SopImportPreview = {
  draft: WorkflowDraft;
  diagnostics: WorkflowDiagnostic[];
  migrated: boolean;
  publishable: boolean;
};

/** 版本列表使用的轻量摘要。 */
export type SopVersionSummary = Omit<WorkflowVersion, "nodes" | "edges"> & {
  nodeCount: number;
  edgeCount: number;
};

/** 工作流版本结构化差异。 */
export type SopVersionDiff = {
  fromVersionId: string;
  toVersionId: string;
  nodes: { added: string[]; removed: string[]; changed: string[] };
  edges: { added: string[]; removed: string[]; changed: string[] };
  fields: { nameChanged: boolean; summaryChanged: boolean; metadataChanged: boolean };
};

/** 版本化模板快照。 */
export type SopTemplate = {
  id: string;
  version: number;
  name: string;
  summary: string;
  sourceWorkflowId: string;
  sourceVersionId: string;
  parameterSchema: Record<string, unknown>;
  draft: WorkflowDraft;
  createdAt: number;
  updatedAt: number;
};

/** 创建或更新模板时写入的新版本。 */
export type SaveSopTemplateInput = {
  id?: string;
  name: string;
  summary?: string;
  sourceVersionId: string;
  parameterSchema?: Record<string, unknown>;
};

/** SQLite 存储健康状态。 */
export type SopStorageHealth = {
  ok: boolean;
  journalMode: string;
  databasePath: string;
  migrationVersion: number;
};
