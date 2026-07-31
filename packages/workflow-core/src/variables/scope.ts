import type { BuiltinWorkflowNode, WorkflowSubgraph } from "../contracts/nodes.js";
import type { VariableRef, WorkflowDataType } from "../contracts/primitives.js";
import type { WorkflowDraft } from "../contracts/workflow.js";
import { findAncestorNodeIds } from "../graph/graph.js";

/** 变量选择器展示的类型化变量。 */
export type AvailableVariable = {
  id: string;
  label: string;
  group: "工作流输入" | "容器输入" | "上游节点" | "系统" | "环境" | "密钥" | "循环";
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

function getSubgraphVariables(
  subgraph: WorkflowSubgraph,
  containerNodeId: string,
  targetNodeId: string,
): AvailableVariable[] {
  const variables: AvailableVariable[] = subgraph.inputs.map((field) => ({
    id: `container-input:${containerNodeId}:${field.id}`,
    label: field.name,
    group: "容器输入",
    dataType: field.dataType,
    ref: { scope: "container-input", containerNodeId, inputId: field.id },
  }));
  const ancestors = findAncestorNodeIds(subgraph.nodes, subgraph.edges, targetNodeId);
  for (const node of subgraph.nodes) {
    if (!ancestors.has(node.id)) continue;
    for (const port of node.ports.outputs) variables.push({
      id: `node-output:${node.id}:${port.id}`,
      label: `${node.label}.${port.name}`,
      group: "上游节点",
      dataType: port.dataType,
      ref: { scope: "node-output", nodeId: node.id, portId: port.id },
    });
  }
  return variables;
}

/** 返回 Iteration 或 Loop 内部节点可见的类型化容器变量。 */
export function getAvailableSubgraphVariables(
  container: BuiltinWorkflowNode<"iteration"> | BuiltinWorkflowNode<"loop">,
  targetNodeId: string,
): AvailableVariable[] {
  const variables = getSubgraphVariables(container.config.body, container.id, targetNodeId);
  if (container.type === "iteration") {
    variables.push(
      {
        id: `loop:${container.id}:item`,
        label: "当前元素",
        group: "循环",
        dataType: "any",
        ref: { scope: "loop", containerNodeId: container.id, key: "item" },
      },
      {
        id: `loop:${container.id}:index`,
        label: "当前索引",
        group: "循环",
        dataType: "integer",
        ref: { scope: "loop", containerNodeId: container.id, key: "index" },
      },
    );
  } else {
    variables.push({
      id: `loop:${container.id}:iteration`,
      label: "循环次数",
      group: "循环",
      dataType: "integer",
      ref: { scope: "loop", containerNodeId: container.id, key: "iteration" },
    });
    for (const variable of container.config.initialVariables) variables.push({
      id: `loop:${container.id}:variable:${variable.id}`,
      label: variable.name,
      group: "循环",
      dataType: variable.dataType,
      ref: { scope: "loop", containerNodeId: container.id, key: "variable", variableId: variable.id },
    });
    for (const output of container.config.body.outputs) variables.push({
      id: `loop:${container.id}:previous-output:${output.id}`,
      label: `上次迭代.${output.name}`,
      group: "循环",
      dataType: output.dataType,
      ref: { scope: "loop", containerNodeId: container.id, key: "previous-output", outputId: output.id },
    });
  }
  return variables;
}

/** 验证变量引用是否属于指定容器实例且在内部拓扑上可达。 */
export function isSubgraphVariableRefAvailable(
  container: BuiltinWorkflowNode<"iteration"> | BuiltinWorkflowNode<"loop">,
  targetNodeId: string,
  ref: VariableRef,
): boolean {
  return getAvailableSubgraphVariables(container, targetNodeId)
    .some((variable) => JSON.stringify(variable.ref) === JSON.stringify(ref));
}
