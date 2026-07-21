import {
  WORKFLOW_SCHEMA_VERSION,
  builtinNodeRegistry,
  isWorkflowDraft,
  migrateSopDraftV1,
  normalizeWorkflowDraft,
  type BuiltinNodeType,
  type WorkflowDraft,
} from "@orbit/workflow-core";

const STORAGE_KEY_V1 = "agent-web-console-sop-drafts-v1";
const STORAGE_KEY_V2 = "agent-web-console-sop-drafts-v2";
const STORAGE_KEY_V1_BACKUP = "agent-web-console-sop-drafts-v1-readonly-backup";

type Store = Pick<Storage, "getItem" | "setItem">;

function uid(prefix = "sop"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJsonArray(raw: string, key: string): unknown[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new TypeError(`${key} 必须是草稿数组。`);
  return parsed;
}

function parseV2Draft(value: unknown): WorkflowDraft {
  if (!isWorkflowDraft(value)) throw new TypeError("workflow v2 草稿结构无效。 ");
  return normalizeWorkflowDraft(value);
}

/** 读取旧 v1 草稿的只读备份原文。 */
export function readLegacySopBackup(storage: Store | null | undefined): string | null {
  return storage?.getItem(STORAGE_KEY_V1_BACKUP) ?? storage?.getItem(STORAGE_KEY_V1) ?? null;
}

/** 读取全部 v2 草稿；首次读取 v1 时先备份，再原子迁移全部草稿。 */
export function listSopDrafts(storage: Store | null | undefined): WorkflowDraft[] {
  if (!storage) return devSopDrafts();
  const v2Raw = storage.getItem(STORAGE_KEY_V2);
  if (v2Raw) return readJsonArray(v2Raw, STORAGE_KEY_V2).map(parseV2Draft).sort((left, right) => right.updatedAt - left.updatedAt);

  const v1Raw = storage.getItem(STORAGE_KEY_V1);
  if (!v1Raw) return devSopDrafts();
  if (!storage.getItem(STORAGE_KEY_V1_BACKUP)) storage.setItem(STORAGE_KEY_V1_BACKUP, v1Raw);

  const migrated = readJsonArray(v1Raw, STORAGE_KEY_V1).map(migrateSopDraftV1);
  storage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated));
  return migrated.sort((left, right) => right.updatedAt - left.updatedAt);
}

/** 持久化 v2 草稿；不会回写或覆盖 v1 只读备份。 */
export function writeSopDrafts(storage: Store | null | undefined, drafts: WorkflowDraft[]): void {
  storage?.setItem(STORAGE_KEY_V2, JSON.stringify(drafts.map(normalizeWorkflowDraft)));
}

/** 新建一份 workflow v2 草稿。 */
export function createSopDraft(name = "未命名流程"): WorkflowDraft {
  const definition = builtinNodeRegistry.get("start")!;
  const config = definition.createDefaultConfig();
  const now = Date.now();
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: uid("sop"),
    name,
    summary: "新建的 SOP 流程草稿。",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    nodes: [{
      kind: "builtin",
      id: uid("n"),
      type: "start",
      version: definition.version,
      label: definition.label,
      position: { x: 320, y: 40 },
      config,
      ports: definition.createPorts(config),
    }],
    edges: [],
  };
}

/** 给草稿追加一个注册表节点。 */
export function appendSopNode(draft: WorkflowDraft, type: BuiltinNodeType, position: { x: number; y: number }): WorkflowDraft {
  const definition = builtinNodeRegistry.get(type)!;
  const config = definition.createDefaultConfig();
  return {
    ...draft,
    updatedAt: Date.now(),
    revision: draft.revision + 1,
    nodes: [...draft.nodes, {
      kind: "builtin",
      id: uid("n"),
      type,
      version: definition.version,
      label: definition.label,
      position,
      config,
      ports: definition.createPorts(config),
    }],
  };
}

function devSopDrafts(): WorkflowDraft[] {
  const now = Date.now();
  return [migrateSopDraftV1({
    id: "sop-review",
    name: "标准评审流",
    summary: "提交材料 → 条件判定 → 归档或退回。",
    updatedAt: now - 1000 * 60 * 30,
    nodes: [
      { id: "r-start", type: "start", label: "开始", position: { x: 320, y: 24 } },
      { id: "r-submit", type: "process", label: "提交材料", position: { x: 300, y: 144 } },
      { id: "r-cond", type: "condition", label: "是否通过", position: { x: 300, y: 264 } },
      { id: "r-report", type: "process", label: "生成报告", position: { x: 120, y: 384 } },
      { id: "r-fix", type: "process", label: "补充材料", position: { x: 480, y: 384 } },
      { id: "r-end", type: "end", label: "结束", position: { x: 300, y: 504 } },
    ],
    edges: [
      { id: "re1", source: "r-start", target: "r-submit" },
      { id: "re2", source: "r-submit", target: "r-cond" },
      { id: "re3", source: "r-cond", target: "r-report", sourceHandle: "true", label: "是" },
      { id: "re4", source: "r-cond", target: "r-fix", sourceHandle: "false", label: "否" },
      { id: "re5", source: "r-report", target: "r-end" },
      { id: "re6", source: "r-fix", target: "r-end" },
    ],
  })];
}
