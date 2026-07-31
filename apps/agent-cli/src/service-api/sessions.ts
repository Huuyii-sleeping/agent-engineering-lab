import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { randomUUID } from "node:crypto";
import type { RuntimeBinding } from "@orbit/runtime-contracts";

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

/** Session 内部持久化的 Memory thread 所有权，不进入现有 session HTTP 摘要。 */
export type AgentSessionMemoryBinding = {
  ownerId: string;
  resourceId: string;
  title?: string;
  metadata: Record<string, unknown>;
};

export type AgentSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  busy: boolean;
  history: ChatCompletionMessageParam[];
  rounds: number;
  agent: AgentRuntimeContext | null;
  memoryBinding?: AgentSessionMemoryBinding;
  runtimeBinding?: RuntimeBinding;
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
  id: string = randomUUID(),
  timestamp = nowMs(),
  agent: AgentRuntimeContext | null = null,
  runtimeBinding: RuntimeBinding = {
    backend: "mastra",
    adapterVersion: "mastra-agent-v1",
    runtimeVersion: "1.52.1",
    selectionReason: "mastra-only runtime",
    verifiedCapabilities: ["generate", "stream", "sessionMemory"],
  },
): AgentSessionRecord {
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    busy: false,
    history: [],
    rounds: 0,
    agent,
    runtimeBinding,
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
    rounds: session.rounds,
    agent: session.agent,
    runtimeBackend: session.runtimeBinding?.backend,
    adapterVersion: session.runtimeBinding?.adapterVersion,
  };
}

export function summarizeSessionTranscript(session: AgentSessionRecord): Record<string, unknown> {
  return {
    ...summarizeSession(session),
    messages: session.history,
  };
}
