import { describe, expect, it } from "vitest";
import { builtinNodeRegistry, getAvailableSubgraphVariables, type BuiltinWorkflowNode } from "@orbit/workflow-core";
import { appendLoopVariable, defaultLoopVariableValue } from "./loop-config";

describe("loop-config", () => {
  it("新增稳定变量并进入 Loop 类型化作用域", () => {
    const definition = builtinNodeRegistry.get("loop")!;
    const config = appendLoopVariable(definition.createDefaultConfig(), () => "loop-variable-stable");
    const node = { kind: "builtin", id: "loop", type: "loop", version: 1, label: "循环", position: { x: 0, y: 0 }, ports: definition.createPorts(config), config } as BuiltinWorkflowNode<"loop">;
    expect(getAvailableSubgraphVariables(node, "child")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "loop:loop:iteration", dataType: "integer" }),
      expect.objectContaining({ id: "loop:loop:variable:loop-variable-stable", dataType: "string" }),
    ]));
    expect(defaultLoopVariableValue("array")).toEqual([]);
  });
});
