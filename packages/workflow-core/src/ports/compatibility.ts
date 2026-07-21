import type { WorkflowNode } from "../contracts/nodes.js";
import type { WorkflowDataType } from "../contracts/primitives.js";
import type { WorkflowEdgeEndpoint } from "../contracts/workflow.js";

/** 端口连接检查结果。 */
export type PortCompatibility = { valid: true } | { valid: false; reason: string };

/** 判断输出数据类型能否赋值给输入数据类型。 */
export function arePortTypesCompatible(source: WorkflowDataType, target: WorkflowDataType): boolean {
  return source === "any" || target === "any" || source === target || (source === "integer" && target === "number");
}

/** 检查两个节点端口的方向、存在性和数据类型。 */
export function checkPortConnection(nodes: readonly WorkflowNode[], source: WorkflowEdgeEndpoint, target: WorkflowEdgeEndpoint): PortCompatibility {
  if (source.nodeId === target.nodeId) return { valid: false, reason: "节点不能连接到自身。" };
  const sourceNode = nodes.find((node) => node.id === source.nodeId);
  const targetNode = nodes.find((node) => node.id === target.nodeId);
  if (!sourceNode || !targetNode) return { valid: false, reason: "连接端点引用了不存在的节点。" };
  const sourcePort = sourceNode.ports.outputs.find((port) => port.id === source.portId);
  const targetPort = targetNode.ports.inputs.find((port) => port.id === target.portId);
  if (!sourcePort) return { valid: false, reason: `输出端口 ${source.portId} 已不存在。` };
  if (!targetPort) return { valid: false, reason: `输入端口 ${target.portId} 已不存在。` };
  if (!arePortTypesCompatible(sourcePort.dataType, targetPort.dataType)) return {
    valid: false,
    reason: `类型不兼容：${sourcePort.dataType} 不能连接到 ${targetPort.dataType}。`,
  };
  return { valid: true };
}
