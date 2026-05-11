import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/observability/runtime.js", () => ({
  isReplayDryRun: vi.fn(() => false),
}));

vi.mock("../../../src/tools/security.js", () => ({
  enforceSecurityGate: vi.fn(async () => ({ ok: true })),
}));

import { isReplayDryRun } from "../../../src/observability/runtime.js";
import { executeProtectedToolHandler, resolveToolExecution } from "../../../src/runtime/tool-runtime.js";
import { enforceSecurityGate } from "../../../src/tools/security.js";

describe("runtime/tool-runtime", () => {
  beforeEach(() => {
    vi.mocked(isReplayDryRun).mockReturnValue(false);
    vi.mocked(enforceSecurityGate).mockResolvedValue({ ok: true });
  });

  it("classifies subagent tools before base fallback", () => {
    const execution = resolveToolExecution("subagent_wait", '{"agent_id":1}', new Set(["subagent_wait"]));

    expect(execution.target).toBe("subagent");
    expect(execution.args.agent_id).toBe(1);
  });

  it("classifies mcp tools by stable prefix", () => {
    const execution = resolveToolExecution("mcp__demo__echo_upper", '{"text":"hello"}', new Set());

    expect(execution.target).toBe("mcp");
    expect(execution.args.text).toBe("hello");
  });

  it("falls back to base tools for non-prefixed names", () => {
    const execution = resolveToolExecution("write_file", '{"path":"tmp/a.txt"}', new Set());

    expect(execution.target).toBe("base");
    expect(execution.args.path).toBe("tmp/a.txt");
  });

  it("blocks tool handlers during replay by default", async () => {
    vi.mocked(isReplayDryRun).mockReturnValue(true);

    const output = await executeProtectedToolHandler({
      name: "write_file",
      args: { path: "tmp/a.txt" },
      handler: async () => "ok",
    });

    expect(output).toContain("REPLAY_DRY_RUN_BLOCKED");
  });

  it("allows replay-safe handlers to execute when explicitly marked", async () => {
    vi.mocked(isReplayDryRun).mockReturnValue(true);
    const handler = vi.fn(async () => "ok");

    const output = await executeProtectedToolHandler({
      name: "read_file",
      args: { path: "tmp/a.txt" },
      handler,
      allowDuringReplay: true,
    });

    expect(output).toBe("ok");
    expect(handler).toHaveBeenCalledWith({ path: "tmp/a.txt" });
    expect(enforceSecurityGate).toHaveBeenCalledWith("read_file", { path: "tmp/a.txt" });
  });
});
