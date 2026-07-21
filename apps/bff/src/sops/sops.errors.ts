import type { WorkflowDraft } from "@orbit/workflow-core";

/** SOP 领域可映射为 HTTP 错误的基类。 */
export class SopDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 请求的 SOP 资源不存在。 */
export class SopNotFoundError extends SopDomainError {
  constructor(resource: string, id: string) {
    super("SOP_NOT_FOUND", `${resource} ${id} 不存在。`, 404, { resource, id });
  }
}

/** 草稿 revision 已过期，客户端必须显式解决冲突。 */
export class SopRevisionConflictError extends SopDomainError {
  constructor(readonly current: WorkflowDraft) {
    super("SOP_REVISION_CONFLICT", `草稿已更新到 revision ${current.revision}，请重新加载或合并后再保存。`, 409, {
      currentRevision: current.revision,
      current,
    });
  }
}

/** 输入或发布前校验失败。 */
export class SopValidationError extends SopDomainError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super("SOP_VALIDATION_FAILED", message, 400, metadata);
  }
}

/** SQLite 打开、完整性检查或恢复失败。 */
export class SopStorageError extends SopDomainError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super("SOP_STORAGE_FAILED", message, 503, metadata);
  }
}
