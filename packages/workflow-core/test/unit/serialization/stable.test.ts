import { describe, expect, it } from "vitest";
import { WORKFLOW_SCHEMA_VERSION } from "../../../src/contracts/primitives.js";
import type { WorkflowDraft } from "../../../src/contracts/workflow.js";
import {
  createContentHash,
  normalizeWorkflowContent,
  normalizeWorkflowDraft,
  stableSerialize,
} from "../../../src/serialization/stable.js";

describe("stableSerialize", () => {
  it("对不同键顺序生成相同内容", async () => {
    const left = { b: 2, a: { y: true, x: "value" } };
    const right = { a: { x: "value", y: true }, b: 2 };
    expect(stableSerialize(left)).toBe(stableSerialize(right));
    expect(await createContentHash(left)).toBe(await createContentHash(right));
  });

  it("遇到不可序列化值时尽早失败", () => {
    expect(() => stableSerialize({ value: Number.NaN })).toThrow("非有限数字");
  });

  it("稳定序列化阶段 E 子图并无损保留 unknown node", async () => {
    const draft = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "workflow-stage-e",
      name: "  Stage E  ",
      summary: "  summary  ",
      revision: 1,
      createdAt: 1,
      updatedAt: 2,
      edges: [],
      nodes: [{
        kind: "unknown",
        type: "future-container",
        id: "future-1",
        version: 9,
        label: "Future",
        position: { x: 0, y: 0 },
        ports: { inputs: [], outputs: [] },
        original: {
          body: {
            id: "body-1",
            nodes: [{ opaque: true, order: [2, 1] }],
            edges: [],
          },
        },
      }],
    } satisfies WorkflowDraft;

    const normalized = normalizeWorkflowDraft(draft);
    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.nodes[0]).toEqual(draft.nodes[0]);
    expect(normalizeWorkflowContent(normalized)).toMatchObject({ name: "Stage E", summary: "summary" });
    expect(await createContentHash(normalizeWorkflowContent(normalized))).toBe(
      await createContentHash(normalizeWorkflowContent({ ...normalized, revision: 99, updatedAt: 999 })),
    );
  });
});
