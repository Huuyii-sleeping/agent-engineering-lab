import type { Connection, Edge, Node } from "@xyflow/react";
import { checkPortConnection } from "@orbit/workflow-core";
import type { SopFlowData, SopFlowEdgeData } from "./sop-flow-adapter";

/** 检查 React Flow Connection 是否满足 workflow 端口契约。 */
export function validateFlowConnection(nodes: readonly Node<SopFlowData>[], connection: Connection) {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return { valid: false as const, reason: "请从输出端口连接到输入端口。" };
  return checkPortConnection(nodes.map((node) => node.data.node), { nodeId: connection.source, portId: connection.sourceHandle }, { nodeId: connection.target, portId: connection.targetHandle });
}

/** 节点端口变化后保留已有边，并明确标记待修复原因。 */
export function reconcileFlowEdges(nodes: readonly Node<SopFlowData>[], edges: readonly Edge<SopFlowEdgeData>[]): Edge<SopFlowEdgeData>[] {
  return edges.map((edge) => {
    const result = validateFlowConnection(nodes, { source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? null, targetHandle: edge.targetHandle ?? null });
    return { ...edge, data: result.valid ? { status: "valid" } : { status: "needs-repair", issue: result.reason } };
  });
}
