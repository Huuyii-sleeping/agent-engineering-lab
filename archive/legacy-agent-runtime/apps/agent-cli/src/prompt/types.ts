export type StablePromptSectionId = "core" | "append" | "tools" | "skills" | "rules" | "agent_memory";
export type DynamicPromptSectionId = "user_context" | "memory" | "compact_summary" | "runtime_reminder";
export type PromptSectionId = StablePromptSectionId | DynamicPromptSectionId;
export type PromptSectionKind =
  | "system"
  | "tool_manifest"
  | "skill_manifest"
  | "rule"
  | "agent_memory"
  | "user_context"
  | "memory"
  | "compact_summary"
  | "runtime_reminder";
export type PromptCachePolicy = "cacheable" | "ephemeral";

export type PromptSection = {
  id: PromptSectionId;
  title: string;
  content: string;
  kind: PromptSectionKind;
  source: string;
  cachePolicy: PromptCachePolicy;
  priority: number;
  estimatedTokens: number;
  inclusionReason: string;
};

export type StaticPromptSource = {
  core: string;
  tools: string[];
  skills: string[];
  rules: string[];
  agentMemory?: {
    agentType: string;
    scope: "user" | "project" | "local";
    mode: "read_write" | "read_only" | "disabled";
    memoryDir: string;
    entrypoint: string;
    currentIndex?: string;
  };
};

export type PromptBuilderInput = StaticPromptSource & {
  overrideSystemPrompt?: string | null;
  appendSystemPrompts?: string[];
  userContext?: string | null;
  memoryContext?: string | null;
  compactSummary?: string | null;
  dynamicMessages?: string[];
};

export type PromptEnvelope = {
  primarySystemPrompt: string;
  supplementalSystemMessages: string[];
  stableSections: PromptSection[];
  dynamicSections: PromptSection[];
};
