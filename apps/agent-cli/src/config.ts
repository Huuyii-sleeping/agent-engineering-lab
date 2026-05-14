import dotenv from "dotenv";
import OpenAI from "openai";
import * as process from "node:process";
import type { StaticPromptSource } from "./prompt/types.js";
import { getConfiguredSkills, toPromptSkillBlocks } from "./skills/loader.js";

dotenv.config({ override: true });

const modelEnv = process.env.MODEL_ID?.trim() ?? "";
export const MODEL = modelEnv || "unset-model";

const CORE_PROMPT = `You are a coding agent working inside ${process.cwd()}.`;
const TOOL_PROMPT_LINES = [
  "Prefer using tools to complete tasks.",
  "For multi-step tasks, use the todo tool to track plan and progress.",
];

export function getStaticPromptSource(): StaticPromptSource {
  const configuredSkills = getConfiguredSkills();
  return {
    core: CORE_PROMPT,
    tools: [...TOOL_PROMPT_LINES],
    skills: toPromptSkillBlocks(configuredSkills.selected),
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

export function createClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}
