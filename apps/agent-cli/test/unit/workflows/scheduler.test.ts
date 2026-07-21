import { describe, expect, it } from "vitest";
import { WORKFLOW_SCHEMA_VERSION, builtinNodeRegistry, compileWorkflow, type WorkflowDraft, type WorkflowIRNode } from "@orbit/workflow-core";
import { WorkflowEventStream } from "../../../src/workflows/events.js";
import { WorkflowExecutorRegistry } from "../../../src/workflows/executor-registry.js";
import { createBasicWorkflowExecutors } from "../../../src/workflows/executors/basic.js";
import { WorkflowScheduler } from "../../../src/workflows/scheduler.js";
import { createWorkflowRun } from "../../../src/workflows/runtime.js";

function builtIn(type: "start" | "condition" | "template" | "end", id: string, config?: unknown) {
  const definition = builtinNodeRegistry.get(type)!;
  const nodeConfig = (config ?? definition.createDefaultConfig()) as never;
  return { kind: "builtin" as const, id, type, version: 1, label: id, position: { x: 0, y: 0 }, config: nodeConfig, ports: definition.createPorts(nodeConfig) };
}

function branchIr() {
  const draft: WorkflowDraft = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "branch",
    name: "branch",
    summary: "",
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      builtIn("start", "start"),
      builtIn("condition", "condition", { expression: "score >= 8", cases: [{ id: "yes", label: "yes", expression: "score >= 8" }, { id: "no", label: "no", expression: "score < 8" }] }),
      builtIn("template", "yes", { template: "passed", variables: {} }),
      builtIn("template", "no", { template: "failed", variables: {} }),
      builtIn("end", "end"),
    ],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "condition", portId: "in" } },
      { id: "e2", source: { nodeId: "condition", portId: "yes" }, target: { nodeId: "yes", portId: "in" } },
      { id: "e3", source: { nodeId: "condition", portId: "no" }, target: { nodeId: "no", portId: "in" } },
      { id: "e4", source: { nodeId: "yes", portId: "text" }, target: { nodeId: "end", portId: "in" } },
      { id: "e5", source: { nodeId: "no", portId: "text" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
  const result = compileWorkflow(draft);
  if (!result.ok) throw new Error(result.diagnostics.map((item) => item.message).join("\n"));
  return result.ir;
}

describe("WorkflowScheduler", () => {
  it("确定性执行命中分支并传播 skipped", async () => {
    const ir = branchIr();
    const registry = new WorkflowExecutorRegistry();
    createBasicWorkflowExecutors().forEach((executor) => registry.register(executor));
    const run = createWorkflowRun({ ir, mode: "draft", inputs: { score: 9 } }, "run-branch");
    const events = new WorkflowEventStream(run.id);

    await new WorkflowScheduler(registry).execute({ run, ir, events, signal: new AbortController().signal });

    expect(run.status).toBe("succeeded");
    expect(run.nodeRuns.yes.status).toBe("succeeded");
    expect(run.nodeRuns.no.status).toBe("skipped");
    expect(run.output).toMatchObject({ in: "passed" });
    expect(events.list().some((event) => event.type === "node.status" && event.nodeId === "no" && event.status === "skipped")).toBe(true);
  });

  it("只重试幂等节点，并支持默认输出继续", async () => {
    const ir = branchIr();
    const target = ir.nodes.find((node) => node.id === "yes")!;
    target.executor = { id: "workflow.retry", version: 1 };
    target.execution = { ...target.execution, idempotent: true, maxAttempts: 2, retryBackoffMs: 0 };
    let attempts = 0;
    const registry = new WorkflowExecutorRegistry();
    createBasicWorkflowExecutors().forEach((executor) => registry.register(executor));
    registry.register({ identity: target.executor, execute: async () => { attempts += 1; if (attempts === 1) throw new Error("temporary"); return { outputs: { text: "retried" } }; } });
    const run = createWorkflowRun({ ir, mode: "draft", inputs: { score: 9 } }, "run-retry");
    await new WorkflowScheduler(registry).execute({ run, ir, events: new WorkflowEventStream(run.id), signal: new AbortController().signal });
    expect(attempts).toBe(2);
    expect(run.nodeRuns.yes.attempt).toBe(2);
    expect(run.status).toBe("succeeded");

    target.execution = { ...target.execution, onError: "default", defaultOutput: { text: "fallback" }, maxAttempts: 1 };
    registry.register({ identity: { id: "workflow.default", version: 1 }, execute: async () => { throw new Error("always"); } });
    target.executor = { id: "workflow.default", version: 1 };
    const fallbackRun = createWorkflowRun({ ir, mode: "draft", inputs: { score: 9 } }, "run-default");
    await new WorkflowScheduler(registry).execute({ run: fallbackRun, ir, events: new WorkflowEventStream(fallbackRun.id), signal: new AbortController().signal });
    expect(fallbackRun.status).toBe("succeeded");
    expect(fallbackRun.nodeRuns.yes.output).toEqual({ text: "fallback" });
  });

  it("非幂等节点失败时不静默重试并定位 attempt", async () => {
    const ir = branchIr();
    const target = ir.nodes.find((node) => node.id === "yes")!;
    target.executor = { id: "workflow.unsafe", version: 1 };
    target.execution = { ...target.execution, idempotent: false, maxAttempts: 3 };
    let attempts = 0;
    const registry = new WorkflowExecutorRegistry();
    createBasicWorkflowExecutors().forEach((executor) => registry.register(executor));
    registry.register({ identity: target.executor, execute: async () => { attempts += 1; throw new Error("unsafe failed"); } });
    const run = createWorkflowRun({ ir, mode: "draft", inputs: { score: 9 } }, "run-unsafe");
    await new WorkflowScheduler(registry).execute({ run, ir, events: new WorkflowEventStream(run.id), signal: new AbortController().signal });
    expect(attempts).toBe(1);
    expect(run.status).toBe("failed");
    expect(run.error).toMatchObject({ nodeId: "yes", attempt: 1 });
  });

  it("执行超时可进入显式 error route", async () => {
    const ir = branchIr();
    const target = ir.nodes.find((node) => node.id === "yes")!;
    target.executor = { id: "workflow.timeout", version: 1 };
    target.execution = { ...target.execution, timeoutMs: 5, maxAttempts: 1, onError: "route", errorPortId: "error" };
    target.ports.outputs.push({ id: "error", name: "错误", direction: "output", dataType: "any" });
    ir.edges = ir.edges.filter((edge) => edge.id !== "e4");
    ir.edges.push({ id: "error-edge", sourceNodeId: "yes", sourcePortId: "error", targetNodeId: "end", targetPortId: "in" });
    const registry = new WorkflowExecutorRegistry();
    createBasicWorkflowExecutors().forEach((executor) => registry.register(executor));
    registry.register({ identity: target.executor, execute: async () => new Promise(() => {}) });
    const run = createWorkflowRun({ ir, mode: "draft", inputs: { score: 9 } }, "run-route");
    await new WorkflowScheduler(registry).execute({ run, ir, events: new WorkflowEventStream(run.id), signal: new AbortController().signal });
    expect(run.status).toBe("succeeded");
    expect(run.nodeRuns.yes).toMatchObject({ status: "failed", handledError: true, error: { code: "WORKFLOW_NODE_TIMEOUT", attempt: 1 } });
    expect(run.output).toMatchObject({ in: { code: "WORKFLOW_NODE_TIMEOUT", nodeId: "yes" } });
  });

  it("在调度前校验必填工作流输入和类型", async () => {
    const ir = branchIr();
    const start = ir.nodes.find((node) => node.type === "start")!;
    start.config = { inputs: [{ id: "score", name: "分数", dataType: "number", required: true }] };
    const registry = new WorkflowExecutorRegistry();
    createBasicWorkflowExecutors().forEach((executor) => registry.register(executor));
    const run = createWorkflowRun({ ir, mode: "draft", inputs: { score: "nine" } }, "run-input");
    await new WorkflowScheduler(registry).execute({ run, ir, events: new WorkflowEventStream(run.id), signal: new AbortController().signal });
    expect(run.status).toBe("failed");
    expect(run.error).toMatchObject({ code: "WORKFLOW_INPUT_INVALID" });
  });
});
