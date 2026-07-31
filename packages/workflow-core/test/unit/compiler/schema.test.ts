import { describe, expect, it } from "vitest";
import { builtinNodeRegistry } from "../../../src/registry/builtins.js";
import { validateWorkflowJsonSchema } from "../../../src/compiler/schema.js";

describe("validateWorkflowJsonSchema", () => {
  it("接受所有阶段 E 节点的默认持久化配置", () => {
    for (const type of [
      "parallel",
      "merge",
      "iteration",
      "loop",
      "subworkflow",
      "agent",
      "human-approval",
    ] as const) {
      const definition = builtinNodeRegistry.get(type)!;
      expect(validateWorkflowJsonSchema(definition.createDefaultConfig(), definition.configSchema, `${type}-1`), type).toEqual([]);
    }
  });

  it("拒绝超过 Parallel、Iteration、Loop 和审批期限上限的配置", () => {
    const cases = [
      ["parallel", "maxConcurrency", 11],
      ["iteration", "maxItems", 1_001],
      ["loop", "maxIterations", 1_001],
      ["human-approval", "deadlineMs", 31 * 24 * 60 * 60 * 1_000],
    ] as const;

    for (const [type, field, value] of cases) {
      const definition = builtinNodeRegistry.get(type)!;
      const config = { ...definition.createDefaultConfig(), [field]: value };
      expect(validateWorkflowJsonSchema(config, definition.configSchema, `${type}-1`)).toEqual([
        expect.objectContaining({ code: "compile.schema", location: { kind: "field", nodeId: `${type}-1`, fieldPath: [field] } }),
      ]);
    }
  });
});
