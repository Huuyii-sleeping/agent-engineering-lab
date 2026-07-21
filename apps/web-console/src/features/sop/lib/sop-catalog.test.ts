import { describe, expect, it } from "vitest";
import { builtinNodeRegistry } from "@orbit/workflow-core";
import { sopNodeCatalog } from "./sop-catalog";

describe("sopNodeCatalog", () => {
  it("完全由 NodeDefinition registry 驱动", () => {
    expect(sopNodeCatalog.map((item) => item.type)).toEqual(builtinNodeRegistry.list().map((item) => item.type));
    expect(sopNodeCatalog.every((item) => item.definition.executor.id.startsWith("workflow."))).toBe(true);
  });
});
