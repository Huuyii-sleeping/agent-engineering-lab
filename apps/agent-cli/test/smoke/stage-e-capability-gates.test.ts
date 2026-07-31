import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES, builtinNodeRegistry } from "@orbit/workflow-core";
import { describe, expect, it } from "vitest";

describe("PRD-115 stage E capability gates", () => {
  it("registers advanced product contracts without enabling hidden runtime control flow", () => {
    const supported = new Set(builtinNodeRegistry.list().map((definition) => definition.type));

    for (const type of [
      "parallel",
      "merge",
      "iteration",
      "loop",
      "subworkflow",
      "agent",
      "human-approval",
    ] as const) {
      expect(supported.has(type), type).toBe(true);
    }
  });

  it("does not hide a second scheduler inside the Mastra compiler adapter", async () => {
    const compiler = await readFile(
      path.join(process.cwd(), "src/mastra/workflows/compiler-adapter.ts"),
      "utf8",
    );

    expect(compiler).not.toContain(".parallel(");
    expect(compiler).not.toContain(".foreach(");
    expect(compiler).not.toContain(".dowhile(");
    expect(compiler).not.toContain(".dountil(");
  });

  it("opens only the independently verified production capabilities", () => {
    expect(DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES).toEqual({
      parallelMerge: false,
      iteration: true,
      boundedLoop: true,
      nestedWorkflow: true,
      agentNode: true,
      humanApproval: true,
      restartResume: true,
    });
  });
});
