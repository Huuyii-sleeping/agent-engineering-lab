import { describe, expect, it } from "vitest";
import { getAvailableVariables } from "../../../src/variables/scope.js";
import { migrateSopDraftV1 } from "../../../src/migration/v1.js";

describe("getAvailableVariables", () => {
  it("只暴露目标节点上游输出和显式环境目录", () => {
    const draft = migrateSopDraftV1({ id: "d", name: "d", summary: "", updatedAt: 1, nodes: [{ id: "s", type: "start", label: "S", position: { x: 0, y: 0 } }, { id: "a", type: "process", label: "A", position: { x: 0, y: 1 } }, { id: "b", type: "process", label: "B", position: { x: 0, y: 2 } }], edges: [{ id: "sa", source: "s", target: "a" }] });
    const variables = getAvailableVariables(draft, "a", { environment: [{ key: "REGION", dataType: "string" }] });
    expect(variables.some((item) => item.id.startsWith("node-output:s:"))).toBe(true);
    expect(variables.some((item) => item.id.startsWith("node-output:b:"))).toBe(false);
    expect(variables.some((item) => item.id === "environment:REGION")).toBe(true);
  });
});
