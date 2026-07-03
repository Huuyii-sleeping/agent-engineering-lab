import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { randomUUID } from "node:crypto";
import { createAgentRuntimeState } from "../bootstrap/app-runtime.js";
import type { AgentRuntimeState } from "../runtime/query-types.js";

export type AgentSkillBinding = {
  skillId: string;
  version: string;
  sourceType: "builtin" | "remote" | "custom";
  registrySource: "official" | "verified" | "community" | "private" | "local";
};

export type AgentRuntimeContext = {
  id: string;
  name: string;
  skills: AgentSkillBinding[];
};

export type AgentSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  busy: boolean;
  history: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  agent: AgentRuntimeContext | null;
};

export function nowMs(): number {
  return Date.now();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cleanText(value: unknown, fallback: string, limit: number): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function cleanOptionalText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanSourceType(value: unknown): AgentSkillBinding["sourceType"] {
  return value === "remote" || value === "custom" || value === "builtin" ? value : "builtin";
}

function cleanRegistrySource(value: unknown, sourceType: AgentSkillBinding["sourceType"]): AgentSkillBinding["registrySource"] {
  if (value === "official" || value === "verified" || value === "community" || value === "private" || value === "local") {
    return value;
  }
  return sourceType === "remote" ? "community" : "local";
}

function normalizeSkillBindings(value: unknown): AgentSkillBinding[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const byId = new Map<string, AgentSkillBinding>();
  for (const item of value) {
    const record = asObject(item);
    const skillId = cleanOptionalText(record.skillId, 80);
    if (!skillId) {
      continue;
    }
    const sourceType = cleanSourceType(record.sourceType);
    byId.set(skillId, {
      skillId,
      version: cleanOptionalText(record.version, 40),
      sourceType,
      registrySource: cleanRegistrySource(record.registrySource, sourceType),
    });
  }
  return [...byId.values()].slice(0, 24);
}

export function normalizeAgentRuntimeContext(value: unknown): AgentRuntimeContext | null {
  const record = asObject(value);
  const id = cleanOptionalText(record.id, 80);
  if (!id) {
    return null;
  }
  return {
    id,
    name: cleanText(record.name, "Agent", 80),
    skills: normalizeSkillBindings(record.skills),
  };
}

export function createAgentSessionRecord(
  id = randomUUID(),
  timestamp = nowMs(),
  agent: AgentRuntimeContext | null = null,
): AgentSessionRecord {
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    busy: false,
    history: [],
    runtimeState: createAgentRuntimeState(id),
    agent,
  };
}

export function sortSessionsByCreatedAt(
  sessions: Iterable<AgentSessionRecord>,
): AgentSessionRecord[] {
  return [...sessions].sort((a, b) => a.createdAt - b.createdAt);
}

export function summarizeSession(session: AgentSessionRecord): Record<string, unknown> {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    busy: session.busy,
    messageCount: session.history.length,
    rounds: session.runtimeState.roundCounter,
    agent: session.agent,
  };
}

export function summarizeSessionTranscript(session: AgentSessionRecord): Record<string, unknown> {
  return {
    ...summarizeSession(session),
    messages: session.history,
  };
}
