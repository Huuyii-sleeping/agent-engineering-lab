import { describe, expect, it } from "vitest";
import { resolveToolExecution } from "../../../src/runtime/tool-runtime.js";

describe("runtime/tool-runtime", () => {
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
});
