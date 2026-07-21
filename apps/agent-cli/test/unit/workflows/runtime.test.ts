import { describe, expect, it } from "vitest";
import { WORKFLOW_SCHEMA_VERSION, builtinNodeRegistry, compileWorkflow, type WorkflowDraft } from "@orbit/workflow-core";
import { WorkflowExecutorRegistry } from "../../../src/workflows/executor-registry.js";
import { createBasicWorkflowExecutors } from "../../../src/workflows/executors/basic.js";
import { WorkflowRuntime } from "../../../src/workflows/runtime.js";

function slowIr() {
  const startDefinition = builtinNodeRegistry.get("start")!;
  const definition = builtinNodeRegistry.get("code")!;
  const endDefinition = builtinNodeRegistry.get("end")!;
  const startConfig = startDefinition.createDefaultConfig();
  const config = definition.createDefaultConfig();
  const endConfig = endDefinition.createDefaultConfig();
  const draft: WorkflowDraft = { schemaVersion: WORKFLOW_SCHEMA_VERSION, id: "slow", name: "slow", summary: "", revision: 0, createdAt: 1, updatedAt: 1, nodes: [
    { kind: "builtin", id: "start", type: "start", version: 1, label: "start", position: { x: 0, y: 0 }, config: startConfig, ports: startDefinition.createPorts(startConfig) },
    { kind: "builtin", id: "slow-node", type: "code", version: 1, label: "slow", position: { x: 0, y: 0 }, config, ports: definition.createPorts(config) },
    { kind: "builtin", id: "end", type: "end", version: 1, label: "end", position: { x: 0, y: 0 }, config: endConfig, ports: endDefinition.createPorts(endConfig) },
  ], edges: [
    { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "slow-node", portId: "in" } },
    { id: "e2", source: { nodeId: "slow-node", portId: "result" }, target: { nodeId: "end", portId: "in" } },
  ] };
  const result = compileWorkflow(draft, { executors: [{ id: "workflow.start", version: 1 }, { id: "workflow.code", version: 1 }, { id: "workflow.end", version: 1 }] });
  if (!result.ok) throw new Error(result.diagnostics.map((item) => item.message).join("\n"));
  result.ir.nodes[0].executor = { id: "workflow.slow", version: 1 };
  return result.ir;
}

describe("WorkflowRuntime", () => {
  it("向执行器传播 AbortSignal 并将运行收敛为 cancelled", async () => {
    const registry = new WorkflowExecutorRegistry();
    createBasicWorkflowExecutors().forEach((executor) => registry.register(executor));
    registry.register({ identity: { id: "workflow.slow", version: 1 }, execute: ({ signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ outputs: { result: "late" } }), 5_000);
      signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
    }) });
    const runtime = new WorkflowRuntime(registry);
    const run = runtime.start({ ir: slowIr(), mode: "draft" });
    expect(runtime.cancel(run.id)).toBe(true);
    const completed = await runtime.wait(run.id);
    expect(completed.status).toBe("cancelled");
    expect(completed.nodeRuns["slow-node"].status).toBe("cancelled");
  });
});
