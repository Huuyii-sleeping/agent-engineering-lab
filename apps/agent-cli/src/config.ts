import dotenv from "dotenv";
import OpenAI from "openai";
import * as process from "node:process";
import type { StaticPromptSource } from "./prompt/types.js";
import { getConfiguredSkillSummaries, toPromptSkillCatalogBlocks } from "./skills/loader.js";

dotenv.config({ override: true });

const modelEnv = process.env.MODEL_ID?.trim() ?? "";
export const MODEL = modelEnv || "unset-model";

const CORE_PROMPT = `You are a coding agent working inside ${process.cwd()}.`;
const TOOL_PROMPT_LINES = [
  "Prefer using tools to complete tasks.",
  "For multi-step tasks, use the todo tool to track plan and progress.",
];

export function getStaticPromptSource(): StaticPromptSource {
  const configuredSkills = getConfiguredSkillSummaries();
  return {
    core: CORE_PROMPT,
    tools: [...TOOL_PROMPT_LINES],
    skills: toPromptSkillCatalogBlocks(configuredSkills.selected),
    rules: [],
  };
}

export function ensureModelConfigured(): void {
  if (!modelEnv) {
    throw new Error("Missing environment variable: MODEL_ID");
  }
}

export function getDefaultModel(): string {
  return MODEL;
}

/** Resolve the OpenAI-compatible base URL, accepting the historical OPENAI_BASEURL alias. */
export function resolveOpenAiBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.OPENAI_BASE_URL?.trim() || env.OPENAI_BASEURL?.trim() || undefined;
}

export function createClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: resolveOpenAiBaseUrl(),
  });
}
