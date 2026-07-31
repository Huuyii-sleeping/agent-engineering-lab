import { describe, expect, it } from "vitest";
import { builtinNodeRegistry } from "@orbit/workflow-core";
import { nodeInspectorRegistry } from "./inspector-registry";

describe("nodeInspectorRegistry", () => {
  it("为共享 registry 的全部内置节点提供 inspector", () => {
    expect(Object.keys(nodeInspectorRegistry).sort()).toEqual(
      builtinNodeRegistry.list().map((definition) => definition.type).sort(),
    );
  });
});
