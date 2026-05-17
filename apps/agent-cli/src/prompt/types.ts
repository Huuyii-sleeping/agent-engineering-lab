export type StablePromptSectionId = "core" | "tools" | "skills" | "rules" | "agent_memory";
export type DynamicPromptSectionId = "memory" | "dynamic";
export type PromptSectionId = StablePromptSectionId | DynamicPromptSectionId;

export type PromptSection = {
  id: PromptSectionId;
  title: string;
  content: string;
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
  memoryContext?: string | null;
  dynamicMessages?: string[];
};

export type PromptEnvelope = {
  primarySystemPrompt: string;
  supplementalSystemMessages: string[];
  stableSections: PromptSection[];
  dynamicSections: PromptSection[];
};
