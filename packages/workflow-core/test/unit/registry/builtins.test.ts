import { describe, expect, it } from "vitest";
import {
  builtinNodeRegistry,
  createNodePorts,
  validateNodeConfig,
} from "../../../src/registry/builtins.js";

describe("builtinNodeRegistry", () => {
  it("注册全部 P0 节点及稳定 executor identity", () => {
    expect(builtinNodeRegistry.list().map((item) => item.type)).toEqual(expect.arrayContaining([
      "start", "end", "llm", "tool", "http", "code", "condition", "template", "variable", "knowledge",
    ]));
    expect(builtinNodeRegistry.get("llm")?.executor).toEqual({ id: "workflow.llm", version: 1 });
  });

  it("根据条件配置生成分支端口", () => {
    const definition = builtinNodeRegistry.get("condition");
    const config = definition!.createDefaultConfig();
    expect(definition!.createPorts(config).outputs.map((port) => port.id)).toEqual(["true", "false"]);
  });

  it("注册阶段 E 节点但保持 Runtime capability 独立开放", () => {
    const stageENodeTypes = [
      "parallel",
      "merge",
      "iteration",
      "loop",
      "subworkflow",
      "agent",
      "human-approval",
    ] as const;

    expect(builtinNodeRegistry.list().map((item) => item.type)).toEqual(expect.arrayContaining(stageENodeTypes));
    expect(stageENodeTypes.map((type) => builtinNodeRegistry.get(type)?.executor)).toEqual([
      { id: "workflow.parallel", version: 1 },
      { id: "workflow.merge", version: 1 },
      { id: "workflow.iteration", version: 1 },
      { id: "workflow.loop", version: 1 },
      { id: "workflow.subworkflow", version: 1 },
      { id: "workflow.agent", version: 1 },
      { id: "workflow.human-approval", version: 1 },
    ]);
  });

  it("按稳定 branch 和 subgraph 字段生成阶段 E 端口", () => {
    const parallel = builtinNodeRegistry.get("parallel")!.createDefaultConfig();
    parallel.branches = [{ id: "research", label: "调研" }, { id: "review", label: "复核" }];
    expect(createNodePorts("parallel", parallel).outputs.map((port) => port.id)).toEqual(["research", "review"]);

    const iteration = builtinNodeRegistry.get("iteration")!.createDefaultConfig();
    iteration.body.inputs.push({ id: "context", name: "上下文", dataType: "object" });
    iteration.body.outputs.push({
      id: "answer",
      name: "答案",
      dataType: "string",
      value: { scope: "node-output", nodeId: "answer-node", portId: "text" },
    });
    const ports = createNodePorts("iteration", iteration);
    expect(ports.inputs.map((port) => port.id)).toEqual(["items", "input:context"]);
    expect(ports.outputs.map((port) => port.id)).toEqual(["results", "output:answer"]);
  });

  it("拒绝越过阶段 E 硬限制或缺少固定产品引用的配置", () => {
    const parallelConfig = { ...builtinNodeRegistry.get("parallel")!.createDefaultConfig(), maxConcurrency: 11 };
    const parallel = {
      kind: "builtin" as const,
      type: "parallel" as const,
      id: "parallel-1",
      version: 1,
      label: "并行",
      position: { x: 0, y: 0 },
      ports: createNodePorts("parallel", parallelConfig),
      config: parallelConfig,
    };
    expect(validateNodeConfig(parallel).map((item) => item.code)).toContain("node.invalid-range");

    const agentConfig = builtinNodeRegistry.get("agent")!.createDefaultConfig();
    expect(Object.keys(agentConfig)).not.toContain("tools");
    expect(agentConfig.memory).toEqual({ isolation: "node-run", shareThread: false });
    const agent = {
      kind: "builtin" as const,
      type: "agent" as const,
      id: "agent-1",
      version: 1,
      label: "Agent",
      position: { x: 0, y: 0 },
      ports: createNodePorts("agent", agentConfig),
      config: agentConfig,
    };
    expect(validateNodeConfig(agent).map((item) => item.location)).toEqual(expect.arrayContaining([
      { kind: "field", nodeId: "agent-1", fieldPath: ["agentProfileId"] },
      { kind: "field", nodeId: "agent-1", fieldPath: ["agentVersionId"] },
    ]));

    const approval = builtinNodeRegistry.get("human-approval")!.createDefaultConfig();
    expect(Object.keys(approval)).not.toEqual(expect.arrayContaining(["resumeToken", "actorCredential", "decision"]));
    expect(approval.deadlineMs).toBe(7 * 24 * 60 * 60 * 1_000);
  });
});
