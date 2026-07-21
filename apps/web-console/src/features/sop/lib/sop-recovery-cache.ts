import { isWorkflowDraft, normalizeWorkflowDraft, type WorkflowDraft } from "@orbit/workflow-core";

const RECOVERY_KEY = "agent-web-console-sop-recovery-v1";

type RecoveryEntry = {
  serverRevision: number;
  savedAt: number;
  draft: WorkflowDraft;
};

type RecoveryDocument = Record<string, RecoveryEntry>;
type RecoveryStorage = Pick<Storage, "getItem" | "setItem">;

function readDocument(storage: RecoveryStorage | null | undefined): RecoveryDocument {
  const raw = storage?.getItem(RECOVERY_KEY);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as RecoveryDocument : {};
  } catch {
    return {};
  }
}

function writeDocument(storage: RecoveryStorage | null | undefined, document: RecoveryDocument): void {
  storage?.setItem(RECOVERY_KEY, JSON.stringify(document));
}

/** 保存尚未提交到 BFF 的浏览器恢复副本；该副本不作为权威数据源。 */
export function writeSopRecovery(storage: RecoveryStorage | null | undefined, serverRevision: number, draft: WorkflowDraft): void {
  const document = readDocument(storage);
  document[draft.id] = { serverRevision, savedAt: Date.now(), draft: normalizeWorkflowDraft(draft) };
  const entries = Object.entries(document).sort(([, left], [, right]) => right.savedAt - left.savedAt).slice(0, 20);
  writeDocument(storage, Object.fromEntries(entries));
}

/** 读取与当前服务端 revision 对应的未提交恢复副本。 */
export function readSopRecovery(storage: RecoveryStorage | null | undefined, serverDraft: WorkflowDraft): WorkflowDraft | null {
  const entry = readDocument(storage)[serverDraft.id];
  if (!entry || entry.serverRevision !== serverDraft.revision || !isWorkflowDraft(entry.draft)) return null;
  return normalizeWorkflowDraft(entry.draft);
}

/** 服务端保存成功或用户选择远端版本后清除恢复副本。 */
export function clearSopRecovery(storage: RecoveryStorage | null | undefined, id: string): void {
  const document = readDocument(storage);
  delete document[id];
  writeDocument(storage, document);
}
