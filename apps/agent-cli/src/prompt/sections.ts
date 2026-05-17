import type { PromptSection, StaticPromptSource } from "./types.js";

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeList(values: string[]): string[] {
  return values.map(normalizeText).filter(Boolean);
}

function joinLines(values: string[]): string {
  return normalizeList(values).join("\n");
}

export function buildStablePromptSections(source: StaticPromptSource): PromptSection[] {
  const sections: PromptSection[] = [];

  const core = normalizeText(source.core);
  if (core) {
    sections.push({ id: "core", title: "Core", content: core });
  }

  const tools = joinLines(source.tools);
  if (tools) {
    sections.push({ id: "tools", title: "Tools", content: tools });
  }

  const skills = joinLines(source.skills);
  if (skills) {
    sections.push({ id: "skills", title: "Skills", content: skills });
  }

  const rules = joinLines(source.rules);
  if (rules) {
    sections.push({ id: "rules", title: "Rules", content: rules });
  }

  const agentMemory = source.agentMemory;
  if (agentMemory && agentMemory.mode !== "disabled") {
    const lines = [
      `agentType=${agentMemory.agentType}`,
      `scope=${agentMemory.scope}`,
      `mode=${agentMemory.mode}`,
      `memoryDir=${agentMemory.memoryDir}`,
      `entrypoint=${agentMemory.entrypoint}`,
      "",
      "Use this agent memory as durable role-specific guidance. Read it before making role-specific decisions.",
      agentMemory.mode === "read_write"
        ? "When durable role knowledge changes, update files only under memoryDir."
        : "Treat this memory as read-only; do not modify files under memoryDir.",
    ];
    const currentIndex = normalizeText(agentMemory.currentIndex ?? "");
    if (currentIndex) {
      lines.push("", "Current index:", currentIndex);
    }
    sections.push({ id: "agent_memory", title: "Agent Memory", content: joinLines(lines) });
  }

  return sections;
}

export function buildDynamicPromptSections(memoryContext?: string | null, dynamicMessages?: string[]): PromptSection[] {
  const sections: PromptSection[] = [];

  const memory = normalizeText(memoryContext ?? "");
  if (memory) {
    sections.push({ id: "memory", title: "Memory", content: memory });
  }

  for (const message of normalizeList(dynamicMessages ?? [])) {
    sections.push({ id: "dynamic", title: "Dynamic", content: message });
  }

  return sections;
}

export function buildPrimarySystemPrompt(sections: PromptSection[]): string {
  return sections
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")
    .trim();
}
