import { WORKFLOW_SCHEMA_VERSION, builtinNodeRegistry, type WorkflowDraft } from "@orbit/workflow-core";

export function createTestDraft(id = "workflow-test"): WorkflowDraft {
  const startDefinition = builtinNodeRegistry.get("start")!;
  const endDefinition = builtinNodeRegistry.get("end")!;
  const startConfig = startDefinition.createDefaultConfig();
  const endConfig = endDefinition.createDefaultConfig();
  const now = Date.now();
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id,
    name: "测试工作流",
    summary: "用于验证 SOP 持久化。",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    nodes: [
      { kind: "builtin", id: "start", type: "start", version: 1, label: "开始", position: { x: 0, y: 0 }, config: startConfig, ports: startDefinition.createPorts(startConfig) },
      { kind: "builtin", id: "end", type: "end", version: 1, label: "结束", position: { x: 0, y: 160 }, config: endConfig, ports: endDefinition.createPorts(endConfig) },
    ],
    edges: [{ id: "edge", source: { nodeId: "start", portId: "out" }, target: { nodeId: "end", portId: "in" }, status: "valid" }],
  };
}
