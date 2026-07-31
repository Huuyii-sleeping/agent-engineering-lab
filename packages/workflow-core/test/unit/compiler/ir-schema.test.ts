import { describe, expect, it } from "vitest";
import { isWorkflowIR } from "../../../src/compiler/ir-schema.js";

describe("isWorkflowIR", () => {
  it("只接受 IR v2 与 Workflow schemaVersion 2 envelope", () => {
    const base = {
      irVersion: 2,
      schemaVersion: 2,
      source: { kind: "draft", workflowId: "workflow", revision: 1, migrated: false },
      nodes: [{ id: "start", type: "start", kind: "executable" }],
      edges: [],
      topology: { orderedNodeIds: ["start"] },
      resourceBudget: {},
      dependencies: [],
    };
    expect(isWorkflowIR(base)).toBe(true);
    expect(isWorkflowIR({ ...base, irVersion: 1 })).toBe(false);
    expect(isWorkflowIR({ ...base, schemaVersion: 3 })).toBe(false);
    expect(isWorkflowIR({ ...base, nodes: [{ id: "start", type: "start" }] })).toBe(false);
  });
});
