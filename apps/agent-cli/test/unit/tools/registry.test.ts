import { describe, expect, it } from "vitest";
import {
  isBuiltinSubagentTool,
  listBuiltinToolRegistrations,
  previewBuiltinToolCall,
  resolveBuiltinToolHandler,
  resolveBuiltinToolRegistration,
} from "../../../src/tools/registry.js";

describe("tools/registry", () => {
  it("classifies subagent tools through explicit registry membership", () => {
    expect(isBuiltinSubagentTool("subagent_wait")).toBe(true);
    expect(isBuiltinSubagentTool("write_file")).toBe(false);
  });

  it("resolves base tool replay strategy from registry metadata", () => {
    expect(resolveBuiltinToolHandler("read_file")?.allowDuringReplay).toBe(true);
    expect(resolveBuiltinToolHandler("write_file")?.allowDuringReplay).toBe(false);
  });

  it("exposes builtin registrations through a target-aware protocol layer", () => {
    const readFile = resolveBuiltinToolRegistration("read_file");
    const spawn = resolveBuiltinToolRegistration("subagent_spawn");
    const registrations = listBuiltinToolRegistrations();

    expect(readFile?.target).toBe("base");
    expect(readFile?.allowDuringReplay).toBe(true);
    expect(readFile?.execution).toMatchObject({
      readOnly: true,
      mutatesWorkspace: false,
      parallelSafe: true,
      riskLevel: "low",
    });
    expect(spawn?.target).toBe("subagent");
    expect(spawn?.allowDuringReplay).toBe(false);
    expect(spawn?.execution.parallelSafe).toBe(false);
    expect(registrations.some((tool) => tool.name === "task_create")).toBe(true);
    expect(registrations.some((tool) => tool.name === "task_claim")).toBe(true);
    expect(registrations.some((tool) => tool.name === "team_mark_inbox_read")).toBe(true);
  });

  it("previews subagent calls using shared registry behavior", () => {
    expect(previewBuiltinToolCall("subagent_wait", '{"agent_id":7}')).toBe("subagent_wait 7");
  });
});
