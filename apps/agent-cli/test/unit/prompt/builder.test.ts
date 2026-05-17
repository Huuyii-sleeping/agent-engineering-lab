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

  it("adds agent memory guidance when an agent definition declares memory", () => {
    const result = buildPromptEnvelope({
      core: "core prompt",
      tools: [],
      skills: [],
      rules: [],
      memoryContext: null,
      dynamicMessages: [],
      agentMemory: {
        agentType: "reviewer",
        scope: "project",
        mode: "read_write",
        memoryDir: ".agent/agent-memory/reviewer",
        entrypoint: "MEMORY.md",
        currentIndex: "# Memory Index\n\n- prefer strict reviews",
      },
    });

    expect(result.primarySystemPrompt).toContain("## Agent Memory");
    expect(result.primarySystemPrompt).toContain("agentType=reviewer");
    expect(result.primarySystemPrompt).toContain("scope=project");
    expect(result.primarySystemPrompt).toContain(".agent/agent-memory/reviewer");
    expect(result.primarySystemPrompt).toContain("prefer strict reviews");
    expect(result.stableSections.map((section) => section.id)).toContain("agent_memory");
  });
});
