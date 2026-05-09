import { buildDynamicPromptSections, buildPrimarySystemPrompt, buildStablePromptSections } from "./sections.js";
import type { PromptBuilderInput, PromptEnvelope } from "./types.js";

export function buildPromptEnvelope(input: PromptBuilderInput): PromptEnvelope {
  const stableSections = buildStablePromptSections(input);
  const dynamicSections = buildDynamicPromptSections(input.memoryContext, input.dynamicMessages);

  return {
    primarySystemPrompt: buildPrimarySystemPrompt(stableSections),
    supplementalSystemMessages: dynamicSections.map((section) => section.content),
    stableSections,
    dynamicSections,
  };
}
