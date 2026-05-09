export type StablePromptSectionId = "core" | "tools" | "skills" | "rules";
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
