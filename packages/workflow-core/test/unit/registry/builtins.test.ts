import { describe, expect, it } from "vitest";
import { builtinNodeRegistry } from "../../../src/registry/builtins.js";

describe("builtinNodeRegistry", () => {
  it("注册全部 P0 节点及稳定 executor identity", () => {
    expect(builtinNodeRegistry.list().map((item) => item.type)).toEqual([
      "start", "end", "llm", "tool", "http", "code", "condition", "template", "variable", "knowledge",
    ]);
    expect(builtinNodeRegistry.get("llm")?.executor).toEqual({ id: "workflow.llm", version: 1 });
  });

  it("根据条件配置生成分支端口", () => {
    const definition = builtinNodeRegistry.get("condition");
    const config = definition!.createDefaultConfig();
    expect(definition!.createPorts(config).outputs.map((port) => port.id)).toEqual(["true", "false"]);
  });
});
