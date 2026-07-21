import type { BuiltinNodeType, WorkflowNode } from "../contracts/nodes.js";
import type { WorkflowDraft, WorkflowEdge } from "../contracts/workflow.js";
import { WORKFLOW_SCHEMA_VERSION } from "../contracts/primitives.js";
import { builtinNodeRegistry } from "../registry/builtins.js";
import { normalizeWorkflowDraft } from "../serialization/stable.js";

type LegacyNodeType = "start" | "condition" | "process" | "ai" | "tool" | "end";
type LegacyNode = {
  id: string;
  type: LegacyNodeType;
  label: string;
  position: { x: number; y: number };
  model?: string;
  condition?: string;
  note?: string;
};
type LegacyEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
};

/** prd-114 保存到 localStorage 的 SOP v1 草稿结构。 */
export type LegacySopDraftV1 = {
  id: string;
  name: string;
  summary: string;
  updatedAt: number;
  nodes: LegacyNode[];
  edges: LegacyEdge[];
};

function assertLegacyDraft(value: unknown): asserts value is LegacySopDraftV1 {
  if (!value || typeof value !== "object") throw new TypeError("SOP v1 草稿必须是对象。 ");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") throw new TypeError("SOP v1 草稿缺少 id 或 name。 ");
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) throw new TypeError("SOP v1 草稿缺少 nodes 或 edges。 ");
}

function mapLegacyType(type: LegacyNodeType): BuiltinNodeType {
  if (type === "ai") return "llm";
  if (type === "process") return "template";
  return type;
}

function migrateNode(node: LegacyNode): WorkflowNode {
  const type = mapLegacyType(node.type);

  if (type === "start") {
    const definition = builtinNodeRegistry.get("start")!;
    const config = definition.createDefaultConfig();
    return { kind: "builtin", id: node.id, type, version: definition.version, label: node.label, position: node.position, description: node.note, config, ports: definition.createPorts(config) };
  }
  if (type === "end") {
    const definition = builtinNodeRegistry.get("end")!;
    const config = definition.createDefaultConfig();
    return { kind: "builtin", id: node.id, type, version: definition.version, label: node.label, position: node.position, description: node.note, config, ports: definition.createPorts(config) };
  }
  if (type === "llm") {
    const definition = builtinNodeRegistry.get("llm")!;
    const config = { model: node.model ?? "gpt-4o", prompt: { kind: "literal", value: node.note ?? "" } as const, temperature: 0.7 };
    return { kind: "builtin", id: node.id, type, version: definition.version, label: node.label, position: node.position, description: node.note, config, ports: definition.createPorts(config) };
  }
  if (type === "condition") {
    const definition = builtinNodeRegistry.get("condition")!;
    const config = { expression: node.condition ?? "value > 0", cases: [{ id: "true", label: "是", expression: "true" }, { id: "false", label: "否", expression: "false" }] };
    return { kind: "builtin", id: node.id, type, version: definition.version, label: node.label, position: node.position, description: node.note, config, ports: definition.createPorts(config) };
  }
  if (type === "tool") {
    const definition = builtinNodeRegistry.get("tool")!;
    const config = { toolId: "", arguments: {} };
    return { kind: "builtin", id: node.id, type, version: definition.version, label: node.label, position: node.position, description: node.note, config, ports: definition.createPorts(config) };
  }
  const definition = builtinNodeRegistry.get("template")!;
  const config = { template: node.note ?? node.label, variables: {} };
  return { kind: "builtin", id: node.id, type: "template", version: definition.version, label: node.label, position: node.position, description: node.note, config, ports: definition.createPorts(config) };
}

function sourcePortId(node: WorkflowNode, sourceHandle?: string | null): string {
  if (node.type === "condition" && (sourceHandle === "true" || sourceHandle === "false")) return sourceHandle;
  return node.ports.outputs[0]?.id ?? sourceHandle ?? "out";
}

function targetPortId(node: WorkflowNode, targetHandle?: string | null): string {
  return node.ports.inputs[0]?.id ?? targetHandle ?? "in";
}

/** 将 prd-114 SOP v1 草稿幂等迁移为 workflow v2。 */
export function migrateSopDraftV1(value: unknown): WorkflowDraft {
  if (value && typeof value === "object" && (value as Record<string, unknown>).schemaVersion === WORKFLOW_SCHEMA_VERSION) {
    return normalizeWorkflowDraft(value as WorkflowDraft);
  }

  assertLegacyDraft(value);
  const nodes = value.nodes.map(migrateNode);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: WorkflowEdge[] = value.edges.map((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) throw new Error(`连边 ${edge.id} 引用了不存在的节点。`);
    return {
      id: edge.id,
      source: { nodeId: edge.source, portId: sourcePortId(source, edge.sourceHandle) },
      target: { nodeId: edge.target, portId: targetPortId(target, edge.targetHandle) },
      label: edge.label,
      status: "valid",
    };
  });
  const updatedAt = Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now();
  return normalizeWorkflowDraft({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: value.id,
    name: value.name,
    summary: value.summary ?? "",
    revision: 0,
    createdAt: updatedAt,
    updatedAt,
    nodes,
    edges,
    metadata: { migratedFrom: "sop-v1" },
  });
}
