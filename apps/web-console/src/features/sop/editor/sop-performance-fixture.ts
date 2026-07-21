import { WORKFLOW_SCHEMA_VERSION, builtinNodeRegistry, type WorkflowDraft, type WorkflowNode } from "@orbit/workflow-core";

/** 创建 200 节点 / 400 边的可重复编辑器性能基线。 */
export function createLargeWorkflowFixture(): WorkflowDraft {
  const startDefinition = builtinNodeRegistry.get("start")!;
  const templateDefinition = builtinNodeRegistry.get("template")!;
  const endDefinition = builtinNodeRegistry.get("end")!;
  const nodes: WorkflowNode[] = Array.from({ length: 200 }, (_, index) => {
    if (index === 0) {
      const config = startDefinition.createDefaultConfig();
      return { kind: "builtin", id: "node-0", type: "start", version: 1, label: "开始", position: { x: 0, y: 0 }, config, ports: startDefinition.createPorts(config) };
    }
    if (index === 199) {
      const config = endDefinition.createDefaultConfig();
      return { kind: "builtin", id: "node-199", type: "end", version: 1, label: "结束", position: { x: 0, y: index * 100 }, config, ports: endDefinition.createPorts(config) };
    }
    const config = { template: `node ${index}`, variables: {} };
    return { kind: "builtin", id: `node-${index}`, type: "template", version: 1, label: `节点 ${index}`, position: { x: (index % 10) * 220, y: Math.floor(index / 10) * 120 }, config, ports: templateDefinition.createPorts(config) };
  });
  const edges = [];
  for (let distance = 1; edges.length < 400; distance += 1) {
    for (let source = 0; source + distance < nodes.length && edges.length < 400; source += 1) {
      const target = source + distance;
      edges.push({ id: `edge-${edges.length}`, source: { nodeId: nodes[source].id, portId: nodes[source].ports.outputs[0].id }, target: { nodeId: nodes[target].id, portId: nodes[target].ports.inputs[0].id }, status: "valid" as const });
    }
  }
  return { schemaVersion: WORKFLOW_SCHEMA_VERSION, id: "large-fixture", name: "200/400 性能基线", summary: "", revision: 0, createdAt: 1, updatedAt: 1, nodes, edges };
}
