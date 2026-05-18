import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import OpenAI from "openai";
import * as process from "node:process";
import { resolveAgentMemoryRoot } from "./memory/files.js";
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

function parseAgentMemoryScope(value: string | undefined): "user" | "project" | "local" {
  const normalized = value?.trim();
  return normalized === "user" || normalized === "local" || normalized === "project" ? normalized : "project";
}

function parseAgentMemoryMode(value: string | undefined): "read_write" | "read_only" | "disabled" {
  const normalized = value?.trim();
  return normalized === "read_only" || normalized === "disabled" || normalized === "read_write"
    ? normalized
    : "read_write";
}

function readAgentMemoryIndex(agentType: string, scope: "user" | "project" | "local"): StaticPromptSource["agentMemory"] {
  const mode = parseAgentMemoryMode(process.env.AGENT_MEMORY_MODE);
  const memory = resolveAgentMemoryRoot(agentType, scope);
  const entrypoint = "MEMORY.md";
  const currentIndex = readFileSync(`${memory.root}/${entrypoint}`, "utf8");
  return {
    agentType: memory.agentType,
    scope,
    mode,
    memoryDir: memory.root,
    entrypoint,
    currentIndex,
  };
}

function getConfiguredAgentMemory(): StaticPromptSource["agentMemory"] {
  const agentType = process.env.AGENT_MEMORY_AGENT_TYPE?.trim();
  if (!agentType) {
    return undefined;
  }
  const scope = parseAgentMemoryScope(process.env.AGENT_MEMORY_SCOPE);
  try {
    return readAgentMemoryIndex(agentType, scope);
  } catch {
    const mode = parseAgentMemoryMode(process.env.AGENT_MEMORY_MODE);
    const memory = resolveAgentMemoryRoot(agentType, scope);
    return {
      agentType: memory.agentType,
      scope,
      mode,
      memoryDir: memory.root,
      entrypoint: "MEMORY.md",
    };
  }
}

export function getStaticPromptSource(): StaticPromptSource {
  const configuredSkills = getConfiguredSkillSummaries();
  return {
    core: CORE_PROMPT,
    tools: [...TOOL_PROMPT_LINES],
    skills: toPromptSkillCatalogBlocks(configuredSkills.selected),
    rules: [],
    agentMemory: getConfiguredAgentMemory(),
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
