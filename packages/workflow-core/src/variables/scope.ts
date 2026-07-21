import type { VariableRef, WorkflowDataType } from "../contracts/primitives.js";
import type { WorkflowDraft } from "../contracts/workflow.js";
import { findAncestorNodeIds } from "../graph/graph.js";

/** 变量选择器展示的类型化变量。 */
export type AvailableVariable = {
  id: string;
  label: string;
  group: "工作流输入" | "上游节点" | "系统" | "环境" | "密钥" | "循环";
  dataType: WorkflowDataType;
  ref: VariableRef;
};

/** 可注入变量选择器的环境和系统变量目录。 */
export type VariableScopeCatalog = {
  system?: Array<{ key: string; label?: string; dataType: WorkflowDataType }>;
  environment?: Array<{ key: string; label?: string; dataType: WorkflowDataType }>;
  secrets?: Array<{ credentialId: string; key?: string; label: string; dataType?: WorkflowDataType }>;
};

/** 返回目标节点在拓扑和作用域上允许引用的变量。 */
export function getAvailableVariables(draft: WorkflowDraft, targetNodeId: string, catalog: VariableScopeCatalog = {}): AvailableVariable[] {
  const variables: AvailableVariable[] = [];
  const ancestors = findAncestorNodeIds(draft.nodes, draft.edges, targetNodeId);
  for (const node of draft.nodes) {
    if (node.kind === "builtin" && node.type === "start") {
      for (const field of node.config.inputs) variables.push({
        id: `workflow-input:${field.id}`,
        label: field.name,
        group: "工作流输入",
        dataType: field.dataType,
        ref: { scope: "workflow-input", inputId: field.id },
      });
    }
    if (!ancestors.has(node.id)) continue;
    for (const port of node.ports.outputs) variables.push({
      id: `node-output:${node.id}:${port.id}`,
      label: `${node.label}.${port.name}`,
      group: "上游节点",
      dataType: port.dataType,
      ref: { scope: "node-output", nodeId: node.id, portId: port.id },
    });
  }
  for (const item of catalog.system ?? []) variables.push({ id: `system:${item.key}`, label: item.label ?? item.key, group: "系统", dataType: item.dataType, ref: { scope: "system", key: item.key } });
  for (const item of catalog.environment ?? []) variables.push({ id: `environment:${item.key}`, label: item.label ?? item.key, group: "环境", dataType: item.dataType, ref: { scope: "environment", key: item.key } });
  for (const item of catalog.secrets ?? []) variables.push({ id: `secret:${item.credentialId}:${item.key ?? ""}`, label: item.label, group: "密钥", dataType: item.dataType ?? "string", ref: { scope: "secret", credentialId: item.credentialId, key: item.key } });
  return variables;
}

/** 验证变量引用是否在目标节点作用域内。 */
export function isVariableRefAvailable(draft: WorkflowDraft, targetNodeId: string, ref: VariableRef, catalog: VariableScopeCatalog = {}): boolean {
  return getAvailableVariables(draft, targetNodeId, catalog).some((variable) => JSON.stringify(variable.ref) === JSON.stringify(ref));
}
