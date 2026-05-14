import { buildPromptEnvelope } from "./builder.js";
import type { StaticPromptSource } from "./types.js";

export type PromptDump = {
  primarySystemPrompt: string;
  supplementalSystemMessages: string[];
  stableSectionIds: string[];
  dynamicSectionIds: string[];
};

export function inspectPromptSource(source: StaticPromptSource): PromptDump {
  const envelope = buildPromptEnvelope(source);
  return {
    primarySystemPrompt: envelope.primarySystemPrompt,
    supplementalSystemMessages: envelope.supplementalSystemMessages,
    stableSectionIds: envelope.stableSections.map((section) => section.id),
    dynamicSectionIds: envelope.dynamicSections.map((section) => section.id),
  };
}
