import {
  BookOpenText,
  Bot,
  Braces,
  Code2,
  Flag,
  GitBranch,
  GitFork,
  GitMerge,
  Globe2,
  ListRestart,
  Play,
  Repeat2,
  Sparkles,
  UserCheck,
  Variable,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { builtinNodeRegistry, type BuiltinNodeType, type NodeDefinition } from "@orbit/workflow-core";

const ICONS: Record<string, LucideIcon> = {
  BookOpenText,
  Bot,
  Braces,
  Code2,
  Flag,
  GitBranch,
  GitFork,
  GitMerge,
  Globe2,
  ListRestart,
  Play,
  Repeat2,
  Sparkles,
  UserCheck,
  Variable,
  Workflow,
  Wrench,
};

/** 节点注册定义在 Web 端的展示适配。 */
export type SopNodeMeta = {
  type: BuiltinNodeType;
  label: string;
  desc: string;
  color: string;
  icon: LucideIcon;
  definition: NodeDefinition<BuiltinNodeType>;
};

/** 节点库直接读取 workflow-core NodeDefinition registry。 */
export const sopNodeCatalog = builtinNodeRegistry.list().map((definition) => ({
  type: definition.type,
  label: definition.label,
  desc: definition.description,
  color: definition.color,
  icon: ICONS[definition.icon] ?? Braces,
  definition: definition as NodeDefinition<BuiltinNodeType>,
})) satisfies SopNodeMeta[];

/** 内置节点类型到展示元信息的索引。 */
export const SOP_TYPE_META = Object.fromEntries(
  sopNodeCatalog.map((meta) => [meta.type, meta]),
) as Record<BuiltinNodeType, SopNodeMeta>;

/** 获取节点元信息，未知节点使用可读的降级展示。 */
export function getSopNodeMeta(type: string): Omit<SopNodeMeta, "definition" | "type"> {
  const known = SOP_TYPE_META[type as BuiltinNodeType];
  return known ?? { label: type, desc: "当前环境未安装此节点", color: "#f43f5e", icon: Braces };
}
