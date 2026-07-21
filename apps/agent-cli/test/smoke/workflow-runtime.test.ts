import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_SCHEMA_VERSION, builtinNodeRegistry, type WorkflowDraft } from "@orbit/workflow-core";
import { compileWorkflowForRuntime } from "../../src/workflows/compiler-adapter.js";
import { createBuiltinWorkflowExecutorRegistry } from "../../src/workflows/executors/index.js";
import { WorkflowRuntime } from "../../src/workflows/runtime.js";

function builtIn<T extends "start" | "llm" | "tool" | "http" | "code" | "condition" | "end">(type: T, id: string, config: unknown) {
  const definition = builtinNodeRegistry.get(type)!;
  return { kind: "builtin" as const, id, type, version: 1, label: id, position: { x: 0, y: 0 }, config: config as never, ports: definition.createPorts(config as never) };
}

describe("Agent workflow runtime smoke", () => {
  it("端到端执行 LLM、Tool、HTTP、Code 和 Condition 组合流程", async () => {
    const llmComplete = vi.fn(async (input: { onDelta(delta: string): void }) => {
      input.onDelta("score");
      return { text: "score", usage: { promptTokens: 1, completionTokens: 1 } };
    });
    const runToolByName = vi.fn(async () => JSON.stringify({ normalized: true }));
    const registry = createBuiltinWorkflowExecutorRegistry({
      llmService: { complete: llmComplete },
      toolService: { runToolByName },
      httpClient: { request: async () => ({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ value: 9 }) }) },
    });
    const draft: WorkflowDraft = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "runtime-smoke",
      name: "Runtime Smoke",
      summary: "LLM Tool HTTP Code Condition",
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        builtIn("start", "start", { inputs: [{ id: "question", name: "问题", dataType: "string", required: true }] }),
        builtIn("llm", "llm", { model: "fake", prompt: { kind: "variable", ref: { scope: "workflow-input", inputId: "question" } } }),
        builtIn("tool", "tool", { toolId: "normalize", arguments: { text: { kind: "variable", ref: { scope: "node-output", nodeId: "llm", portId: "text" } } } }),
        builtIn("http", "http", { method: "POST", url: { kind: "literal", value: "https://93.184.216.34/score" }, headers: {}, body: { kind: "variable", ref: { scope: "node-output", nodeId: "tool", portId: "result" } }, timeoutMs: 1_000 }),
        builtIn("code", "code", { language: "javascript", source: "return input.response.value;", inputs: { response: { kind: "variable", ref: { scope: "node-output", nodeId: "http", portId: "body" } } } }),
        builtIn("condition", "condition", { expression: "value >= 8", cases: [{ id: "yes", label: "通过", expression: "value >= 8" }, { id: "no", label: "拒绝", expression: "value < 8" }] }),
        builtIn("end", "end", { outputs: [] }),
      ],
      edges: [
        { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "llm", portId: "in" } },
        { id: "e2", source: { nodeId: "llm", portId: "text" }, target: { nodeId: "tool", portId: "in" } },
        { id: "e3", source: { nodeId: "tool", portId: "result" }, target: { nodeId: "http", portId: "in" } },
        { id: "e4", source: { nodeId: "http", portId: "body" }, target: { nodeId: "code", portId: "in" } },
        { id: "e5", source: { nodeId: "code", portId: "result" }, target: { nodeId: "condition", portId: "in" } },
        { id: "e6", source: { nodeId: "condition", portId: "yes" }, target: { nodeId: "end", portId: "in" } },
        { id: "e7", source: { nodeId: "condition", portId: "no" }, target: { nodeId: "end", portId: "in" } },
      ],
    };
    const ir = compileWorkflowForRuntime(draft, { executors: registry.identities() });
    const runtime = new WorkflowRuntime(registry);
    const started = runtime.start({ ir, mode: "draft", inputs: { question: "score?" } });
    const completed = await runtime.wait(started.id);

    expect(completed.status).toBe("succeeded");
    expect(completed.nodeRuns.condition.output).toMatchObject({ selected: "yes" });
    expect(completed.output).toEqual({ in: true });
    expect(llmComplete).toHaveBeenCalledOnce();
    expect(runToolByName).toHaveBeenCalledOnce();
    expect(runtime.listEvents(started.id).some((event) => event.type === "node.output" && event.nodeId === "llm" && event.delta === "score")).toBe(true);
  });
});
