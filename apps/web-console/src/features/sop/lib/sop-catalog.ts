import { Cpu, Flag, GitBranch, Play, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import type { SopNodeType } from "./sop-types";

/** 节点类型的展示元信息（标签、说明、配色、图标）。 */
export type SopNodeMeta = {
  type: SopNodeType;
  label: string;
  desc: string;
  /** 类型语义色（仅用于节点类型区分，不贯穿全页主强调）。 */
  color: string;
  icon: LucideIcon;
};

/** 6 类节点库（左侧可拖拽）。 */
export const sopNodeCatalog: SopNodeMeta[] = [
  { type: "start", label: "开始", desc: "流程起点", color: "#22c55e", icon: Play },
  { type: "condition", label: "条件分支", desc: "按表达式分流", color: "#f59e0b", icon: GitBranch },
  { type: "process", label: "处理", desc: "通用处理步骤", color: "#3b82f6", icon: Cpu },
  { type: "ai", label: "AI 节点", desc: "调用大模型", color: "#8b5cf6", icon: Sparkles },
  { type: "tool", label: "工具调用", desc: "执行外部工具", color: "#06b6d4", icon: Wrench },
  { type: "end", label: "结束", desc: "流程终点", color: "#94a3b8", icon: Flag },
];

export const SOP_TYPE_META: Record<SopNodeType, SopNodeMeta> = Object.fromEntries(
  sopNodeCatalog.map((meta) => [meta.type, meta]),
) as Record<SopNodeType, SopNodeMeta>;

/** 节点是否需要「源 handle」（可向下连线）。 */
export function hasSourceHandle(type: SopNodeType): boolean {
  return type !== "end";
}

/** 节点是否需要「目标 handle」（可被上游连线）。 */
export function hasTargetHandle(type: SopNodeType): boolean {
  return type !== "start";
}

/** 条件节点有两条出边（true / false）。 */
export function isCondition(type: SopNodeType): boolean {
  return type === "condition";
}
