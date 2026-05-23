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
    expect(result.stableSections[0]).toMatchObject({
      kind: "system",
      source: "core",
      cachePolicy: "cacheable",
      priority: 10,
      inclusionReason: "base agent instructions",
    });
    expect(result.stableSections[0]?.estimatedTokens).toBeGreaterThan(0);
  });

  it("applies override and append prompt sources in deterministic stable order", () => {
    const result = buildPromptEnvelope({
      core: "core prompt",
      overrideSystemPrompt: "override prompt",
      appendSystemPrompts: ["append A", "append B"],
      tools: ["tool guidance"],
      skills: [],
      rules: [],
    });

    expect(result.primarySystemPrompt).toContain("## Core\noverride prompt");
    expect(result.primarySystemPrompt).not.toContain("core prompt");
    expect(result.stableSections.map((section) => section.id)).toEqual(["core", "append", "append", "tools"]);
    expect(result.stableSections.map((section) => section.priority)).toEqual([10, 20, 20, 30]);
  });

  it("keeps user context, memory, compact summaries and runtime reminders as supplemental system messages", () => {
    const result = buildPromptEnvelope({
      core: "core prompt",
      tools: [],
      skills: [],
      rules: [],
      userContext: "<user_context>focus on prompt runtime</user_context>",
      memoryContext: "<memory_context>remember this</memory_context>",
      compactSummary: "<compact_summary>old turns summarized</compact_summary>",
      dynamicMessages: ["<reminder>do the thing</reminder>", "runtime notice"],
    });

    expect(result.primarySystemPrompt).toBe("## Core\ncore prompt");
    expect(result.supplementalSystemMessages).toEqual([
      "<user_context>focus on prompt runtime</user_context>",
      "<memory_context>remember this</memory_context>",
      "<compact_summary>old turns summarized</compact_summary>",
      "<reminder>do the thing</reminder>",
      "runtime notice",
    ]);
    expect(result.dynamicSections.map((section) => section.id)).toEqual([
      "user_context",
      "memory",
      "compact_summary",
      "runtime_reminder",
      "runtime_reminder",
    ]);
    expect(result.dynamicSections.map((section) => section.cachePolicy)).toEqual([
      "ephemeral",
      "ephemeral",
      "ephemeral",
      "ephemeral",
      "ephemeral",
    ]);
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

  it("bounds long agent memory indexes in the stable prompt", () => {
    const longIndex = Array.from({ length: 140 }, (_, index) => `line-${index + 1}`).join("\n");

    const result = buildPromptEnvelope({
      core: "core prompt",
      tools: [],
      skills: [],
      rules: [],
      agentMemory: {
        agentType: "reviewer",
        scope: "project",
        mode: "read_only",
        memoryDir: ".agent/agent-memory/reviewer",
        entrypoint: "MEMORY.md",
        currentIndex: longIndex,
      },
    });

    expect(result.primarySystemPrompt).toContain("line-120");
    expect(result.primarySystemPrompt).not.toContain("line-121");
    expect(result.primarySystemPrompt).toContain("Agent memory index truncated");
    expect(result.primarySystemPrompt).toContain("retainedLines=120");
  });

  it("keeps short agent memory indexes unchanged", () => {
    const result = buildPromptEnvelope({
      core: "core prompt",
      tools: [],
      skills: [],
      rules: [],
      agentMemory: {
        agentType: "reviewer",
        scope: "project",
        mode: "read_only",
        memoryDir: ".agent/agent-memory/reviewer",
        entrypoint: "MEMORY.md",
        currentIndex: "# Memory Index\n\n- prefer strict reviews",
      },
    });

    expect(result.primarySystemPrompt).toContain("# Memory Index\n\n- prefer strict reviews");
    expect(result.primarySystemPrompt).not.toContain("Agent memory index truncated");
  });
});
