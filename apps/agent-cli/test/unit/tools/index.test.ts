import { describe, expect, it } from "vitest";
import { withExecutionContext } from "../../../src/observability/runtime.js";
import { runToolByName } from "../../../src/tools/index.js";

describe("tools/index", () => {
  it("blocks write side effects during replay dry-run before security approval logic", async () => {
    const output = JSON.parse(
      await withExecutionContext({ traceId: "trace_test", replayMode: "dry_run" }, () =>
        runToolByName("write_file", JSON.stringify({ path: "tmp/replay-dry-run.txt", content: "hello" })),
      ),
    ) as { ok?: boolean; error?: { code?: string } };

    expect(output.ok).toBe(false);
    expect(output.error?.code).toBe("REPLAY_DRY_RUN_BLOCKED");
  });

  it("loads a discovered local skill through the base tool surface", async () => {
    const output = JSON.parse(
      await runToolByName("load_skill", JSON.stringify({ name: "openspec-apply-change" })),
    ) as {
      ok?: boolean;
      skill?: {
        name?: string;
        base_dir?: string;
        content?: string;
        source_type?: string;
        allowed_tools?: string[];
        can_run_shell?: boolean;
      };
    };

    expect(output.ok).toBe(true);
    expect(output.skill?.name).toBe("openspec-apply-change");
    expect(output.skill?.base_dir).toContain("openspec-apply-change");
    expect(output.skill?.content).toContain("Base directory for this skill:");
    expect(output.skill?.content).toContain("Implement tasks from an OpenSpec change");
    expect(output.skill?.source_type).toBeDefined();
    expect(output.skill?.allowed_tools).toBeDefined();
    expect(output.skill?.can_run_shell).toBeDefined();
  });
});
