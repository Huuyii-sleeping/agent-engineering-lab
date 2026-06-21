import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { LocalStoreService } from "../local-store.service.js";

/** User-managed agent profile persisted by the BFF business store. */
export type AgentProfile = {
  id: string;
  avatarId: string;
  name: string;
  description: string;
  scenario: string;
  skillIds: string[];
  actions: string[];
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
};

const AGENTS_STORE_KEY = "agents";

const defaultAgentProfile: Omit<AgentProfile, "id" | "createdAt" | "updatedAt"> = {
  avatarId: "brain",
  name: "本地研发 Agent",
  description: "面向代码、文档和自动化执行的本地 agent。",
  scenario: "本地研发、资料整理、任务拆解和交付验证。",
  skillIds: ["code-workspace", "memory-context", "quality-gate"],
  actions: ["分析需求", "执行任务", "验证结果"],
  systemPrompt: "你是一个严谨的本地工作台 agent，优先明确目标、执行验证，并给出可复查的结果。",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cleanText(value: unknown, fallback: string, limit: number): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const next = value.trim();
  return (next || fallback).slice(0, limit);
}

function cleanOptionalText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanStringList(value: unknown, limit: number, itemLimit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, itemLimit))
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

function cleanAvatarId(value: unknown): string {
  const avatarIds = new Set(["brain", "bot", "code", "compass"]);
  return typeof value === "string" && avatarIds.has(value) ? value : defaultAgentProfile.avatarId;
}

function cleanTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Normalizes an agent profile before it leaves or enters the business store. */
export function normalizeAgentProfile(value: unknown, fallbackId: string = randomUUID(), fallbackTime = Date.now()): AgentProfile {
  const record = asRecord(value);
  const id = cleanText(record.id, fallbackId, 80);
  const createdAt = cleanTimestamp(record.createdAt, fallbackTime);
  return {
    id,
    avatarId: cleanAvatarId(record.avatarId),
    name: cleanText(record.name, defaultAgentProfile.name, 36),
    description: cleanOptionalText(record.description, 140) || defaultAgentProfile.description,
    scenario: cleanOptionalText(record.scenario, 180) || defaultAgentProfile.scenario,
    skillIds: cleanStringList(record.skillIds, 24, 80),
    actions: cleanStringList(record.actions, 24, 80),
    systemPrompt: cleanOptionalText(record.systemPrompt, 1600) || defaultAgentProfile.systemPrompt,
    createdAt,
    updatedAt: cleanTimestamp(record.updatedAt, createdAt),
  };
}

@Injectable()
export class AgentProfileService {
  constructor(@Inject(LocalStoreService) private readonly store: LocalStoreService) {}

  /** Lists user-managed agent profiles from newest update to oldest. */
  async listAgents(): Promise<AgentProfile[]> {
    const agents = await this.readAgents();
    return [...agents].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  /** Creates and persists a new agent profile. */
  async createAgent(input: unknown): Promise<AgentProfile> {
    const now = Date.now();
    const agent = normalizeAgentProfile(
      { ...defaultAgentProfile, ...asRecord(input), id: randomUUID(), createdAt: now, updatedAt: now },
      randomUUID(),
      now,
    );
    const agents = await this.readAgents();
    await this.writeAgents([agent, ...agents]);
    return agent;
  }

  /** Updates an existing agent profile and returns null when the id is unknown. */
  async updateAgent(agentId: string, input: unknown): Promise<AgentProfile | null> {
    const agents = await this.readAgents();
    const current = agents.find((agent) => agent.id === agentId);
    if (!current) {
      return null;
    }
    const updated = normalizeAgentProfile(
      {
        ...current,
        ...asRecord(input),
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: Date.now(),
      },
      current.id,
      current.createdAt,
    );
    await this.writeAgents(agents.map((agent) => (agent.id === agentId ? updated : agent)));
    return updated;
  }

  /** Deletes an existing agent profile and reports whether a record was removed. */
  async deleteAgent(agentId: string): Promise<boolean> {
    const agents = await this.readAgents();
    const nextAgents = agents.filter((agent) => agent.id !== agentId);
    if (nextAgents.length === agents.length) {
      return false;
    }
    await this.writeAgents(nextAgents);
    return true;
  }

  private async readAgents(): Promise<AgentProfile[]> {
    const value = await this.store.readSection(AGENTS_STORE_KEY, []);
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => normalizeAgentProfile(item))
      .filter((agent, index, agents) => agents.findIndex((candidate) => candidate.id === agent.id) === index);
  }

  private async writeAgents(agents: AgentProfile[]): Promise<AgentProfile[]> {
    return this.store.writeSection(AGENTS_STORE_KEY, agents);
  }
}
