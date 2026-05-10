import { describe, expect, it } from "vitest";
import { buildPromptEnvelope } from "../../../src/prompt/builder.js";

describe("buildPromptEnvelope", () => {
  it("assembles stable sections in the expected order", () => {
    const result = buildPromptEnvelope({
      core: "core prompt",
      tools: ["tool guidance"],
      skills: ["skill guidance"],
      rules: ["rule guidance"],
      memoryContext: null,
      dynamicMessages: [],
    });

    expect(result.primarySystemPrompt).toContain("## Core\ncore prompt");
    expect(result.primarySystemPrompt).toContain("## Tools\ntool guidance");
    expect(result.primarySystemPrompt).toContain("## Skills\nskill guidance");
    expect(result.primarySystemPrompt).toContain("## Rules\nrule guidance");
    expect(result.stableSections.map((section) => section.id)).toEqual(["core", "tools", "skills", "rules"]);
  });

  it("keeps memory and dynamic reminders as supplemental system messages", () => {
    const result = buildPromptEnvelope({
      core: "core prompt",
      tools: [],
      skills: [],
      rules: [],
      memoryContext: "<memory_context>remember this</memory_context>",
      dynamicMessages: ["<reminder>do the thing</reminder>", "runtime notice"],
    });

    expect(result.primarySystemPrompt).toBe("## Core\ncore prompt");
    expect(result.supplementalSystemMessages).toEqual([
      "<memory_context>remember this</memory_context>",
      "<reminder>do the thing</reminder>",
      "runtime notice",
    ]);
    expect(result.dynamicSections.map((section) => section.id)).toEqual(["memory", "dynamic", "dynamic"]);
  });
});
