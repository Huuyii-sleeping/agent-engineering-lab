import type { WorkflowDraft } from "../contracts/workflow.js";
import { WORKFLOW_SCHEMA_VERSION } from "../contracts/primitives.js";

function normalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("工作流内容包含非有限数字。 ");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeJsonValue(child)]),
    );
  }
  throw new TypeError(`工作流内容包含不可序列化值：${typeof value}`);
}

/** 对 JSON 兼容值进行稳定序列化。 */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

/** 生成与浏览器和 Node 兼容的 SHA-256 内容 hash。 */
export async function createContentHash(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("当前运行环境不支持 Web Crypto SHA-256。 ");
  const bytes = new TextEncoder().encode(stableSerialize(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 生成用于内容 hash 的规范化草稿快照，排除 revision 和时间字段。 */
export function normalizeWorkflowContent(draft: WorkflowDraft) {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: draft.id,
    name: draft.name.trim(),
    summary: draft.summary.trim(),
    nodes: [...draft.nodes].sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...draft.edges].sort((left, right) => left.id.localeCompare(right.id)),
    metadata: draft.metadata,
  };
}

/** 规范化 v2 草稿的基础字段和确定性顺序。 */
export function normalizeWorkflowDraft(draft: WorkflowDraft): WorkflowDraft {
  return {
    ...draft,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    name: draft.name.trim(),
    summary: draft.summary.trim(),
    revision: Math.max(0, Math.trunc(draft.revision)),
    createdAt: Number.isFinite(draft.createdAt) ? draft.createdAt : draft.updatedAt,
    updatedAt: Number.isFinite(draft.updatedAt) ? draft.updatedAt : Date.now(),
  };
}
