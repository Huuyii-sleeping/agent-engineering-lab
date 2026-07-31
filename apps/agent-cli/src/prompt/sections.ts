import type {
  PromptCachePolicy,
  PromptSection,
  PromptSectionId,
  PromptSectionKind,
  StaticPromptSource,
} from "./types.js";

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeList(values: string[]): string[] {
  return values.map(normalizeText).filter(Boolean);
}

function joinLines(values: string[]): string {
  return normalizeList(values).join("\n");
}

function estimateTokens(value: string): number {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function createPromptSection(input: {
  id: PromptSectionId;
  title: string;
  content: string;
  kind: PromptSectionKind;
  source: string;
  cachePolicy: PromptCachePolicy;
  priority: number;
  inclusionReason: string;
}): PromptSection | null {
  const content = normalizeText(input.content);
  if (!content) {
    return null;
  }
  return {
    ...input,
    content,
    estimatedTokens: estimateTokens(content),
  };
}

function pushSection(sections: PromptSection[], section: PromptSection | null): void {
  if (section) {
    sections.push(section);
  }
}

export function buildStablePromptSections(
  source: StaticPromptSource & { overrideSystemPrompt?: string | null; appendSystemPrompts?: string[] },
): PromptSection[] {
  const sections: PromptSection[] = [];

  pushSection(
    sections,
    createPromptSection({
      id: "core",
      title: "Core",
      content: source.overrideSystemPrompt ?? source.core,
      kind: "system",
      source: source.overrideSystemPrompt ? "override" : "core",
      cachePolicy: "cacheable",
      priority: 10,
      inclusionReason: source.overrideSystemPrompt ? "explicit system prompt override" : "base agent instructions",
    }),
  );

  for (const appendPrompt of normalizeList(source.appendSystemPrompts ?? [])) {
    pushSection(
      sections,
      createPromptSection({
        id: "append",
        title: "Append",
        content: appendPrompt,
        kind: "system",
        source: "append",
        cachePolicy: "cacheable",
        priority: 20,
        inclusionReason: "explicit appended system instructions",
      }),
    );
  }

  const tools = joinLines(source.tools);
  pushSection(
    sections,
    createPromptSection({
      id: "tools",
      title: "Tools",
      content: tools,
      kind: "tool_manifest",
      source: "tools",
      cachePolicy: "cacheable",
      priority: 30,
      inclusionReason: "available tool guidance",
    }),
  );

  const skills = joinLines(source.skills);
  pushSection(
    sections,
    createPromptSection({
      id: "skills",
      title: "Skills",
      content: skills,
      kind: "skill_manifest",
      source: "skills",
      cachePolicy: "cacheable",
      priority: 40,
      inclusionReason: "configured skill catalog",
    }),
  );

  const rules = joinLines(source.rules);
  pushSection(
    sections,
    createPromptSection({
      id: "rules",
      title: "Rules",
      content: rules,
      kind: "rule",
      source: "rules",
      cachePolicy: "cacheable",
      priority: 50,
      inclusionReason: "configured runtime rules",
    }),
  );

  return sections;
}

export function createUserContextSection(userContext?: string | null): PromptSection | null {
  return createPromptSection({
    id: "user_context",
    title: "User Context",
    content: userContext ?? "",
    kind: "user_context",
    source: "user_context",
    cachePolicy: "ephemeral",
    priority: 90,
    inclusionReason: "current user context",
  });
}

export function createMemoryContextSection(memoryContext?: string | null): PromptSection | null {
  return createPromptSection({
    id: "memory",
    title: "Memory",
    content: memoryContext ?? "",
    kind: "memory",
    source: "memory_retrieval",
    cachePolicy: "ephemeral",
    priority: 100,
    inclusionReason: "retrieved memory context",
  });
}

export function createCompactSummarySection(compactSummary?: string | null): PromptSection | null {
  return createPromptSection({
    id: "compact_summary",
    title: "Compact Summary",
    content: compactSummary ?? "",
    kind: "compact_summary",
    source: "context_compaction",
    cachePolicy: "ephemeral",
    priority: 110,
    inclusionReason: "context compaction recovery summary",
  });
}

export function createRuntimeReminderSection(message: string): PromptSection | null {
  return createPromptSection({
    id: "runtime_reminder",
    title: "Runtime Reminder",
    content: message,
    kind: "runtime_reminder",
    source: "runtime",
    cachePolicy: "ephemeral",
    priority: 130,
    inclusionReason: "runtime reminder",
  });
}

export function buildDynamicPromptSections(
  input: {
    userContext?: string | null;
    memoryContext?: string | null;
    compactSummary?: string | null;
    dynamicMessages?: string[];
  } = {},
): PromptSection[] {
  const sections: PromptSection[] = [];
  pushSection(sections, createUserContextSection(input.userContext));
  pushSection(sections, createMemoryContextSection(input.memoryContext));
  pushSection(sections, createCompactSummarySection(input.compactSummary));

  for (const message of normalizeList(input.dynamicMessages ?? [])) {
    pushSection(sections, createRuntimeReminderSection(message));
  }

  return sections;
}

export function buildPrimarySystemPrompt(sections: PromptSection[]): string {
  return sections
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")
    .trim();
}
