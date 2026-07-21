import type { WorkflowDraft, WorkflowVersion } from "@orbit/workflow-core";
import type { SopTemplate, SopVersionSummary } from "./sops.types.js";

export type PublishVersionRecord = Omit<WorkflowVersion, "id" | "version">;

/** SOP 持久化边界；业务规则由 service 处理，驱动实现只负责事务与数据映射。 */
export interface SopsRepository {
  listDrafts(): WorkflowDraft[];
  getDraft(id: string): WorkflowDraft | null;
  createDraft(draft: WorkflowDraft): WorkflowDraft;
  updateDraft(id: string, expectedRevision: number, draft: WorkflowDraft): WorkflowDraft;
  deleteDraft(id: string, expectedRevision?: number): boolean;
  publishVersion(version: PublishVersionRecord): WorkflowVersion;
  listVersions(workflowId: string): SopVersionSummary[];
  getVersion(workflowId: string, versionId: string): WorkflowVersion | null;
  getVersionById(versionId: string): WorkflowVersion | null;
  createTemplate(template: SopTemplate): SopTemplate;
  listTemplates(): SopTemplate[];
  getTemplate(id: string, version?: number): SopTemplate | null;
  deleteTemplate(id: string): boolean;
}
