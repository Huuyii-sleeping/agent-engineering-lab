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
});
