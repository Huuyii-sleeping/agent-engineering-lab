import { describe, expect, it } from "vitest";
import { isBuiltinSubagentTool, previewBuiltinToolCall, resolveBuiltinToolHandler } from "../../../src/tools/registry.js";

describe("tools/registry", () => {
  it("classifies subagent tools through explicit registry membership", () => {
    expect(isBuiltinSubagentTool("subagent_wait")).toBe(true);
    expect(isBuiltinSubagentTool("write_file")).toBe(false);
  });

  it("resolves base tool replay strategy from registry metadata", () => {
    expect(resolveBuiltinToolHandler("read_file")?.allowDuringReplay).toBe(true);
    expect(resolveBuiltinToolHandler("write_file")?.allowDuringReplay).toBe(false);
  });

  it("previews subagent calls using shared registry behavior", () => {
    expect(previewBuiltinToolCall("subagent_wait", '{"agent_id":7}')).toBe("subagent_wait 7");
  });
});
