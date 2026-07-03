import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { LocalStoreService } from "../local-store.service.js";
import { SkillRegistryService } from "../skills/skill-registry.service.js";
import type { SkillRegistryItem } from "../skills/skill-types.js";
import type { SkillRegistrySource, SkillSourceType } from "../skills/skill-types.js";

/** Version-locked skill binding persisted on an agent profile. */
export type AgentSkillBinding = {
  skillId: string;
  version: string;
  sourceType: SkillSourceType;
  registrySource: SkillRegistrySource;
};

/** User-managed agent profile persisted by the BFF business store. */
export type AgentProfile = {
  id: string;
  avatarId: string;
  name: string;
  description: string;
  scenario: string;
  skillIds: string[];
  skills: AgentSkillBinding[];
  actions: string[];
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentSkillBindingValidationIssue = {
  skillId: string;
  code: "SKILL_NOT_INSTALLED" | "VERSION_MISMATCH" | "SOURCE_MISMATCH" | "REGISTRY_SOURCE_MISMATCH";
  message: string;
};

export class AgentSkillBindingValidationError extends Error {
  readonly code = "AGENT_SKILL_BINDING_INVALID";

  constructor(readonly issues: AgentSkillBindingValidationIssue[]) {
    super("agent skill binding is invalid");
  }
}

const AGENTS_STORE_KEY = "agents";

const defaultAgentProfile: Omit<AgentProfile, "id" | "createdAt" | "updatedAt"> = {
  avatarId: "brain",
  name: "本地研发 Agent",
  description: "面向代码、文档和自动化执行的本地 agent。",
  scenario: "本地研发、资料整理、任务拆解和交付验证。",
  skillIds: ["code-workspace", "memory-context", "quality-gate"],
  skills: [
    legacySkillBinding("code-workspace"),
    legacySkillBinding("memory-context"),
    legacySkillBinding("quality-gate"),
  ],
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

function cleanSourceType(value: unknown): SkillSourceType {
  return value === "remote" || value === "custom" || value === "builtin" ? value : "builtin";
}

function cleanRegistrySource(value: unknown, sourceType: SkillSourceType): SkillRegistrySource {
  if (value === "official" || value === "verified" || value === "community" || value === "private" || value === "local") {
    return value;
  }
  return sourceType === "remote" ? "community" : "local";
}

function legacySkillBinding(skillId: string): AgentSkillBinding {
  return {
    skillId,
    version: "",
    sourceType: "builtin",
    registrySource: "local",
  };
}

function cleanAgentSkillBindings(value: unknown, legacySkillIds: string[]): AgentSkillBinding[] {
  if (!Array.isArray(value)) {
    return legacySkillIds.map(legacySkillBinding);
  }
  const byId = new Map<string, AgentSkillBinding>();
  for (const item of value) {
    const record = asRecord(item);
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
  const bindings = [...byId.values()].slice(0, 24);
  return bindings.length ? bindings : legacySkillIds.map(legacySkillBinding);
}

function mergeAgentProfileInput(base: Omit<AgentProfile, "id" | "createdAt" | "updatedAt"> | AgentProfile, input: unknown): Record<string, unknown> {
  const inputRecord = asRecord(input);
  const merged = { ...base, ...inputRecord };
  if (Array.isArray(inputRecord.skillIds) && !Array.isArray(inputRecord.skills)) {
    delete (merged as Record<string, unknown>).skills;
  }
  return merged;
}

function skillBindingFromInstalled(skill: SkillRegistryItem): AgentSkillBinding {
  return {
    skillId: skill.id,
    version: skill.installedVersion || skill.version,
    sourceType: skill.sourceType,
    registrySource: skill.registrySource,
  };
}

/** Normalizes an agent profile before it leaves or enters the business store. */
export function normalizeAgentProfile(value: unknown, fallbackId: string = randomUUID(), fallbackTime = Date.now()): AgentProfile {
  const record = asRecord(value);
  const id = cleanText(record.id, fallbackId, 80);
  const createdAt = cleanTimestamp(record.createdAt, fallbackTime);
  const legacySkillIds = cleanStringList(record.skillIds, 24, 80);
  const skills = cleanAgentSkillBindings(record.skills, legacySkillIds);
  return {
    id,
    avatarId: cleanAvatarId(record.avatarId),
    name: cleanText(record.name, defaultAgentProfile.name, 36),
    description: cleanOptionalText(record.description, 140) || defaultAgentProfile.description,
    scenario: cleanOptionalText(record.scenario, 180) || defaultAgentProfile.scenario,
    skillIds: skills.map((skill) => skill.skillId),
    skills,
    actions: cleanStringList(record.actions, 24, 80),
    systemPrompt: cleanOptionalText(record.systemPrompt, 1600) || defaultAgentProfile.systemPrompt,
    createdAt,
    updatedAt: cleanTimestamp(record.updatedAt, createdAt),
  };
}

@Injectable()
export class AgentProfileService {
  constructor(
    @Inject(LocalStoreService) private readonly store: LocalStoreService,
    @Inject(SkillRegistryService) private readonly skillRegistryService: SkillRegistryService,
  ) {}

  /** Lists user-managed agent profiles from newest update to oldest. */
  async listAgents(): Promise<AgentProfile[]> {
    const agents = await this.readAgents();
    return [...agents].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  /** Creates and persists a new agent profile. */
  async createAgent(input: unknown): Promise<AgentProfile> {
    const now = Date.now();
    const inputRecord = asRecord(input);
    const agent = normalizeAgentProfile(
      { ...mergeAgentProfileInput(defaultAgentProfile, input), id: randomUUID(), createdAt: now, updatedAt: now },
      randomUUID(),
      now,
    );
    const validated = await this.validateAgentSkillBindings(agent, {
      dropUnavailable: !Array.isArray(inputRecord.skillIds) && !Array.isArray(inputRecord.skills),
    });
    const agents = await this.readAgents();
    await this.writeAgents([validated, ...agents]);
    return validated;
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
        ...mergeAgentProfileInput(current, input),
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: Date.now(),
      },
      current.id,
      current.createdAt,
    );
    const validated = await this.validateAgentSkillBindings(updated);
    await this.writeAgents(agents.map((agent) => (agent.id === agentId ? validated : agent)));
    return validated;
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

  private async validateAgentSkillBindings(
    agent: AgentProfile,
    options: { dropUnavailable?: boolean } = {},
  ): Promise<AgentProfile> {
    const installedSkills = (await this.skillRegistryService.listSkills()).filter((skill) => skill.installed);
    const installedById = new Map(installedSkills.map((skill) => [skill.id, skill]));
    const issues: AgentSkillBindingValidationIssue[] = [];
    const nextSkills: AgentSkillBinding[] = [];

    for (const binding of agent.skills) {
      const installed = installedById.get(binding.skillId);
      if (!installed) {
        if (!options.dropUnavailable) {
          issues.push({
            skillId: binding.skillId,
            code: "SKILL_NOT_INSTALLED",
            message: `skill ${binding.skillId} is not installed`,
          });
        }
        continue;
      }
      const expected = skillBindingFromInstalled(installed);
      if (binding.version && binding.version !== expected.version) {
        issues.push({
          skillId: binding.skillId,
          code: "VERSION_MISMATCH",
          message: `skill ${binding.skillId} is installed at ${expected.version || "(unknown)"}, not ${binding.version}`,
        });
        continue;
      }
      if (binding.sourceType !== expected.sourceType) {
        issues.push({
          skillId: binding.skillId,
          code: "SOURCE_MISMATCH",
          message: `skill ${binding.skillId} source type is ${expected.sourceType}, not ${binding.sourceType}`,
        });
        continue;
      }
      if (binding.registrySource !== expected.registrySource) {
        issues.push({
          skillId: binding.skillId,
          code: "REGISTRY_SOURCE_MISMATCH",
          message: `skill ${binding.skillId} registry source is ${expected.registrySource}, not ${binding.registrySource}`,
        });
        continue;
      }
      nextSkills.push(expected);
    }

    if (issues.length) {
      throw new AgentSkillBindingValidationError(issues);
    }
    return {
      ...agent,
      skillIds: nextSkills.map((skill) => skill.skillId),
      skills: nextSkills,
    };
  }
}
