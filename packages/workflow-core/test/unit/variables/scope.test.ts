import { describe, expect, it } from "vitest";
import { builtinNodeRegistry } from "../../../src/registry/builtins.js";
import {
  getAvailableSubgraphVariables,
  getAvailableVariables,
  isSubgraphVariableRefAvailable,
} from "../../../src/variables/scope.js";
import { migrateSopDraftV1 } from "../../../src/migration/v1.js";

describe("getAvailableVariables", () => {
  it("只暴露目标节点上游输出和显式环境目录", () => {
    const draft = migrateSopDraftV1({ id: "d", name: "d", summary: "", updatedAt: 1, nodes: [{ id: "s", type: "start", label: "S", position: { x: 0, y: 0 } }, { id: "a", type: "process", label: "A", position: { x: 0, y: 1 } }, { id: "b", type: "process", label: "B", position: { x: 0, y: 2 } }], edges: [{ id: "sa", source: "s", target: "a" }] });
    const variables = getAvailableVariables(draft, "a", { environment: [{ key: "REGION", dataType: "string" }] });
    expect(variables.some((item) => item.id.startsWith("node-output:s:"))).toBe(true);
    expect(variables.some((item) => item.id.startsWith("node-output:b:"))).toBe(false);
    expect(variables.some((item) => item.id === "environment:REGION")).toBe(true);
  });

  it("为 Iteration 注入 item/index 且只暴露内部上游输出", () => {
    const iterationDefinition = builtinNodeRegistry.get("iteration")!;
    const templateDefinition = builtinNodeRegistry.get("template")!;
    const firstConfig = { template: "first", variables: {} };
    const secondConfig = { template: "second", variables: {} };
    const config = iterationDefinition.createDefaultConfig();
    config.body.inputs = [{ id: "context", name: "上下文", dataType: "object" }];
    config.body.nodes = [
      { kind: "builtin", type: "template", id: "first", version: 1, label: "First", position: { x: 0, y: 0 }, config: firstConfig, ports: templateDefinition.createPorts(firstConfig) },
      { kind: "builtin", type: "template", id: "second", version: 1, label: "Second", position: { x: 0, y: 1 }, config: secondConfig, ports: templateDefinition.createPorts(secondConfig) },
      { kind: "builtin", type: "template", id: "other", version: 1, label: "Other", position: { x: 1, y: 0 }, config: secondConfig, ports: templateDefinition.createPorts(secondConfig) },
    ];
    config.body.edges = [{ id: "first-second", source: { nodeId: "first", portId: "text" }, target: { nodeId: "second", portId: "in" } }];
    const container = {
      kind: "builtin" as const,
      type: "iteration" as const,
      id: "iteration-1",
      version: 1,
      label: "Iteration",
      position: { x: 0, y: 0 },
      config,
      ports: iterationDefinition.createPorts(config),
    };

    const variables = getAvailableSubgraphVariables(container, "second");
    expect(variables.map((item) => item.id)).toEqual(expect.arrayContaining([
      "container-input:iteration-1:context",
      "node-output:first:text",
      "loop:iteration-1:item",
      "loop:iteration-1:index",
    ]));
    expect(variables.map((item) => item.id)).not.toContain("node-output:other:text");
    expect(isSubgraphVariableRefAvailable(container, "second", {
      scope: "loop",
      containerNodeId: "iteration-1",
      key: "item",
    })).toBe(true);
    expect(isSubgraphVariableRefAvailable(container, "second", {
      scope: "loop",
      containerNodeId: "another-iteration",
      key: "item",
    })).toBe(false);
  });

  it("为 Loop 注入 iteration、显式变量和上次迭代输出", () => {
    const loopDefinition = builtinNodeRegistry.get("loop")!;
    const config = loopDefinition.createDefaultConfig();
    config.initialVariables = [{
      id: "total",
      name: "累计值",
      dataType: "number",
      value: { kind: "literal", value: 0 },
    }];
    config.body.outputs = [{
      id: "next-total",
      name: "下一累计值",
      dataType: "number",
      value: { scope: "node-output", nodeId: "calculate", portId: "result" },
    }];
    const container = {
      kind: "builtin" as const,
      type: "loop" as const,
      id: "loop-1",
      version: 1,
      label: "Loop",
      position: { x: 0, y: 0 },
      config,
      ports: loopDefinition.createPorts(config),
    };

    expect(getAvailableSubgraphVariables(container, "calculate").map((item) => item.id)).toEqual(expect.arrayContaining([
      "loop:loop-1:iteration",
      "loop:loop-1:variable:total",
      "loop:loop-1:previous-output:next-total",
    ]));
  });
});
