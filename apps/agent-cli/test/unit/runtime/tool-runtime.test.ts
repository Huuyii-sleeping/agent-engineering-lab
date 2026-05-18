import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/observability/runtime.js", () => ({
  isReplayDryRun: vi.fn(() => false),
}));

vi.mock("../../../src/tools/security.js", () => ({
  enforceSecurityGate: vi.fn(async () => ({ ok: true })),
}));

import { isReplayDryRun } from "../../../src/observability/runtime.js";
import {
  executeProtectedToolHandler,
  resolveToolExecution,
  validateToolInput,
} from "../../../src/runtime/tool-runtime.js";
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

  it("keeps malformed JSON as a parse error instead of silently using empty args", () => {
    const execution = resolveToolExecution("read_file", '{"path":', new Set());

    expect(execution.args).toEqual({});
    expect(execution.parseError).toContain("Invalid JSON");
  });

  it("validates required, enum, and primitive argument schema before execution", () => {
    const schema = {
      type: "object",
      required: ["path", "mode"],
      properties: {
        path: { type: "string" },
        mode: { type: "string", enum: ["read", "write"] },
        limit: { type: "integer" },
      },
    };

    expect(validateToolInput(schema, { path: "README.md", mode: "read", limit: 10 })).toEqual([]);
    expect(validateToolInput(schema, { path: 7, mode: "delete" })).toEqual([
      "path must be string",
      "mode must be one of read, write",
    ]);
    expect(validateToolInput(schema, { path: "README.md" })).toEqual(["mode is required"]);
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
