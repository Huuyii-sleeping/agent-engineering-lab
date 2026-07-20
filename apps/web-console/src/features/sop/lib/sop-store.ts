import type { SopDraft, SopEdge, SopNode, SopNodeType } from "./sop-types";

const STORAGE_KEY = "agent-web-console-sop-drafts-v1";

type Store = Pick<Storage, "getItem" | "setItem">;

function uid(prefix = "sop"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanText(value: unknown, fallback: string, limit: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return (trimmed || fallback).slice(0, limit);
}

function cleanNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function knownNodeType(value: unknown): value is SopNodeType {
  return value === "start" || value === "condition" || value === "process" || value === "ai" || value === "tool" || value === "end";
}

/* ── 规范化 ──────────────────────────────────────────────── */

function normalizeNode(value: unknown, fallbackId: string): SopNode | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!knownNodeType(record.type)) return null;
  const position = (record.position ?? {}) as Record<string, unknown>;
  return {
    id: cleanText(record.id, fallbackId, 64),
    type: record.type,
    label: cleanText(record.label, "未命名节点", 40),
    position: { x: cleanNumber(position.x, 0), y: cleanNumber(position.y, 0) },
    model: record.model == null ? undefined : cleanText(record.model, "", 40),
    condition: record.condition == null ? undefined : cleanText(record.condition, "", 80),
    note: record.note == null ? undefined : cleanText(record.note, "", 200),
  };
}

function normalizeEdge(value: unknown, fallbackId: string): SopEdge | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const source = cleanText(record.source, "", 64);
  const target = cleanText(record.target, "", 64);
  if (!source || !target) return null;
  return {
    id: cleanText(record.id, fallbackId, 64),
    source,
    target,
    sourceHandle: typeof record.sourceHandle === "string" ? record.sourceHandle : null,
    targetHandle: typeof record.targetHandle === "string" ? record.targetHandle : null,
    label: typeof record.label === "string" && record.label ? record.label : undefined,
  };
}

/** 规范化一份草稿，确保节点 id 唯一、连边两端都存在。 */
export function normalizeSopDraft(value: unknown): SopDraft | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
  const nodes: SopNode[] = [];
  const seen = new Set<string>();
  rawNodes.forEach((raw, index) => {
    const node = normalizeNode(raw, `n${index}`);
    if (!node) return;
    let id = node.id;
    while (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    nodes.push({ ...node, id });
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawEdges = Array.isArray(record.edges) ? record.edges : [];
  const edges: SopEdge[] = [];
  const edgeSeen = new Set<string>();
  rawEdges.forEach((raw, index) => {
    const edge = normalizeEdge(raw, `e${index}`);
    if (!edge || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    let id = edge.id;
    while (edgeSeen.has(id)) id = `${id}-${index}`;
    edgeSeen.add(id);
    edges.push({ ...edge, id });
  });
  return {
    id: cleanText(record.id, uid(), 64),
    name: cleanText(record.name, "未命名流程", 48),
    summary: cleanText(record.summary, "", 160),
    updatedAt: cleanNumber(record.updatedAt, Date.now()),
    nodes,
    edges,
  };
}

/* ── 本地 CRUD ───────────────────────────────────────────── */

/** 读取全部草稿（按更新时间倒序）。 */
export function listSopDrafts(storage: Store | null | undefined): SopDraft[] {
  if (!storage) return devSopDrafts();
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return devSopDrafts();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return devSopDrafts();
    const drafts = parsed
      .map((item) => normalizeSopDraft(item))
      .filter((draft): draft is SopDraft => draft !== null);
    return drafts.length > 0 ? drafts : devSopDrafts();
  } catch {
    return devSopDrafts();
  }
}

/** 持久化全部草稿。 */
export function writeSopDrafts(storage: Store | null | undefined, drafts: SopDraft[]): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(drafts.map((draft) => normalizeSopDraft(draft) ?? draft)));
}

/** 新建一份草稿（含一个开始节点）。 */
export function createSopDraft(name = "未命名流程"): SopDraft {
  return {
    id: uid("sop"),
    name,
    summary: "新建的 SOP 流程草稿。",
    updatedAt: Date.now(),
    nodes: [{ id: uid("n"), type: "start", label: "开始", position: { x: 320, y: 40 } }],
    edges: [],
  };
}

/** 给草稿追加一个节点（用于拖拽落点）。 */
export function appendSopNode(draft: SopDraft, type: SopNodeType, position: { x: number; y: number }): SopDraft {
  const meta = type;
  const label = type === "start" ? "开始" : type === "end" ? "结束" : type === "condition" ? "条件分支" : type === "ai" ? "AI 节点" : type === "tool" ? "工具调用" : "处理";
  void meta;
  const node: SopNode = {
    id: uid("n"),
    type,
    label,
    position,
    ...(type === "ai" ? { model: "gpt-4o" } : {}),
    ...(type === "condition" ? { condition: "value > 0" } : {}),
  };
  return { ...draft, nodes: [...draft.nodes, node] };
}

/* ── 开发期 mock 数据 ────────────────────────────────────── */

function devSopDrafts(): SopDraft[] {
  const now = Date.now();
  return [
    {
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
    },
    {
      id: "sop-data",
      name: "数据管线",
      summary: "拉取 → 建模 → 看板。",
      updatedAt: now - 1000 * 60 * 60 * 5,
      nodes: [
        { id: "d-start", type: "start", label: "开始", position: { x: 320, y: 24 } },
        { id: "d-pull", type: "tool", label: "拉取数据", position: { x: 300, y: 144 } },
        { id: "d-ai", type: "ai", label: "清洗与建模", model: "claude-3.5", position: { x: 300, y: 264 } },
        { id: "d-board", type: "process", label: "生成看板", position: { x: 300, y: 384 } },
        { id: "d-end", type: "end", label: "结束", position: { x: 320, y: 504 } },
      ],
      edges: [
        { id: "de1", source: "d-start", target: "d-pull" },
        { id: "de2", source: "d-pull", target: "d-ai" },
        { id: "de3", source: "d-ai", target: "d-board" },
        { id: "de4", source: "d-board", target: "d-end" },
      ],
    },
  ];
}
