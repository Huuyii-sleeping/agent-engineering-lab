import { describe, expect, it } from "vitest";
import { WORKFLOW_SCHEMA_VERSION, builtinNodeRegistry, type WorkflowDraft, type WorkflowVersion } from "@orbit/workflow-core";
import { WorkflowRuntimeService } from "../../../src/workflows/service.js";

function node<T extends "start" | "template" | "end">(type: T, id: string) {
  const definition = builtinNodeRegistry.get(type)!;
  const config = definition.createDefaultConfig();
  return { kind: "builtin" as const, id, type, version: definition.version, label: id, position: { x: 0, y: 0 }, config, ports: definition.createPorts(config) };
}

function draft(): WorkflowDraft {
  const start = node("start", "start");
  const template = node("template", "template");
  const end = node("end", "end");
  template.config.template = "完成";
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "workflow-service",
    name: "Workflow Service",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [start, template, end],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "template", portId: "in" } },
      { id: "e2", source: { nodeId: "template", portId: "text" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

function service() {
  return new WorkflowRuntimeService({
    client: {} as never,
    modelPolicyService: {} as never,
    toolService: { runToolByName: async () => "{}" } as never,
  });
}

describe("WorkflowRuntimeService", () => {
  it("执行草稿并暴露有序事件", async () => {
    const runtime = service();
    const run = runtime.start({ workflow: draft(), mode: "draft" });

    await viWaitFor(() => runtime.get(run.id)?.status === "succeeded");
    const events = runtime.events(run.id);
    expect(events.map((event) => event.id)).toEqual(events.map((_event, index) => index + 1));
    expect(events.at(-1)).toMatchObject({ type: "run.status", status: "succeeded" });
  });

  it("production 仅接受不可变发布版本", async () => {
    const runtime = service();
    expect(() => runtime.start({ workflow: draft(), mode: "production" })).toThrow("不可变发布版本");
    const source = draft();
    const version: WorkflowVersion = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "version-1",
      workflowId: source.id,
      version: 1,
      contentHash: "hash-1",
      createdAt: 2,
      createdBy: "test",
      nodes: source.nodes,
      edges: source.edges,
      metadata: { name: source.name },
    };
    const run = runtime.start({ workflow: version, mode: "production" });
    await viWaitFor(() => runtime.get(run.id)?.status === "succeeded");
    expect(runtime.get(run.id)).toMatchObject({ versionId: "version-1", contentHash: "hash-1", mode: "production" });
  });

  it("单节点试运行要求存在的目标节点", () => {
    const runtime = service();
    expect(() => runtime.start({ workflow: draft(), mode: "node-test" })).toThrow("target_node_id");
    expect(() => runtime.start({ workflow: draft(), mode: "node-test", target_node_id: "missing" })).toThrow("不存在");
  });
});

async function viWaitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("等待运行完成超时。");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
