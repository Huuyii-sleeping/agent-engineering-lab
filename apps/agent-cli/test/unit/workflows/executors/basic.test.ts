import { describe, expect, it } from "vitest";
import type { WorkflowIRNode } from "@orbit/workflow-core";
import { createBasicWorkflowExecutors } from "../../../../src/workflows/executors/basic.js";
import { WorkflowVariableContext } from "../../../../src/workflows/context.js";
import type { WorkflowExecutorContext } from "../../../../src/workflows/executor-registry.js";

function executorContext(node: WorkflowIRNode, variables: WorkflowVariableContext, inputs: Record<string, unknown> = {}): WorkflowExecutorContext {
  return { runId: "run", node, inputs, variables, signal: new AbortController().signal, emitLog: () => {}, emitDelta: () => {} };
}

function irNode(type: WorkflowIRNode["type"], config: unknown, ports: WorkflowIRNode["ports"]): WorkflowIRNode {
  return { id: type, type, nodeVersion: 1, label: type, disabled: false, config: config as WorkflowIRNode["config"], ports, executor: { id: `workflow.${type}`, version: 1 }, execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" } };
}

describe("basic workflow executors", () => {
  it("执行 Start、Template、Variable、Condition 和 End 节点", async () => {
    const executors = new Map(createBasicWorkflowExecutors().map((item) => [item.identity.id, item]));
    const variables = new WorkflowVariableContext({ inputs: { name: "Orbit", score: 9 } });

    const start = irNode("start", { inputs: [{ id: "name", name: "名称", dataType: "string" }] }, { inputs: [], outputs: [] });
    const startResult = await executors.get("workflow.start")!.execute(executorContext(start, variables));
    expect(startResult.outputs).toMatchObject({ "input:name": "Orbit" });
    variables.setNodeOutput("start", startResult.outputs);

    const template = irNode("template", { template: "Hello {{name}}", variables: { name: { kind: "variable", ref: { scope: "workflow-input", inputId: "name" } } } }, { inputs: [], outputs: [] });
    await expect(executors.get("workflow.template")!.execute(executorContext(template, variables))).resolves.toEqual({ outputs: { text: "Hello Orbit" } });

    const variable = irNode("variable", { assignments: [{ key: "score", value: { kind: "variable", ref: { scope: "workflow-input", inputId: "score" } } }] }, { inputs: [], outputs: [] });
    await expect(executors.get("workflow.variable")!.execute(executorContext(variable, variables))).resolves.toEqual({ outputs: { score: 9 } });

    const condition = irNode("condition", { expression: "score >= 8", cases: [{ id: "yes", label: "是", expression: "score >= 8" }, { id: "no", label: "否", expression: "score < 8" }] }, { inputs: [], outputs: [] });
    await expect(executors.get("workflow.condition")!.execute(executorContext(condition, variables, { score: 9 }))).resolves.toMatchObject({ selectedPortIds: ["yes"] });

    const end = irNode("end", { outputs: [{ id: "answer", name: "结果", value: { scope: "workflow-input", inputId: "name" } }] }, { inputs: [], outputs: [] });
    await expect(executors.get("workflow.end")!.execute(executorContext(end, variables))).resolves.toEqual({ outputs: { answer: "Orbit" } });
  });
});
