/** SOP 编排领域类型定义。 */

/** 画布支持的节点类型。 */
export type SopNodeType = "start" | "condition" | "process" | "ai" | "tool" | "end";

/** 单个画布节点。 */
export type SopNode = {
  id: string;
  type: SopNodeType;
  label: string;
  position: { x: number; y: number };
  /** AI 节点的模型标识（如 gpt-4o / claude-3.5）。 */
  model?: string;
  /** 条件节点的分支表达式。 */
  condition?: string;
  /** 通用备注。 */
  note?: string;
};

/** 画布连边。 */
export type SopEdge = {
  id: string;
  source: string;
  target: string;
  /** 起点 handle（条件节点可能为 "true" / "false"）。 */
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** 分支标签，例如「是 / 否」。 */
  label?: string;
};

/** 一个 SOP 草稿（对应列表页的一张卡片）。 */
export type SopDraft = {
  id: string;
  name: string;
  summary: string;
  updatedAt: number;
  nodes: SopNode[];
  edges: SopEdge[];
};
