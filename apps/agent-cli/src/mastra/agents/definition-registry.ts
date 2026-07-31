import { createHash } from "node:crypto";
import { Agent, type ToolsInput } from "@mastra/core/agent";
import type { Mastra } from "@mastra/core/mastra";
import type { MastraMemory } from "@mastra/core/memory";
import type { MastraModelConfig } from "@mastra/core/llm";
import { standardSchemaToJSONSchema } from "@mastra/core/schema";

export const MASTRA_AGENT_DEFINITION_ADAPTER_VERSION = "mastra-agent-definition-v1";

/** Orbit Agent 版本解析后用于构建 Mastra Agent 的稳定 definition。 */
export type OrbitMastraAgentDefinition = {
  agentId: string;
  agentVersion: string;
  name: string;
  instructions: string[];
  model: MastraModelConfig;
  tools: ToolsInput;
  toolIds: string[];
  skillIds: string[];
  memory?: MastraMemory;
};

export type RegisteredMastraAgent = {
  runtimeAgentId: string;
  cacheKey: string;
  agent: Agent;
};

type AgentFactoryInput = OrbitMastraAgentDefinition & {
  runtimeAgentId: string;
};

type RegistryOptions = {
  mastra: Pick<Mastra, "addAgent">;
  createAgent?: (input: AgentFactoryInput) => Agent;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function definitionCacheKey(definition: OrbitMastraAgentDefinition): string {
  const serialized = JSON.stringify(stableValue({
    adapterVersion: MASTRA_AGENT_DEFINITION_ADAPTER_VERSION,
    agentId: definition.agentId,
    agentVersion: definition.agentVersion,
    instructions: definition.instructions,
    model: definition.model,
    toolIds: [...definition.toolIds].sort(),
    toolDefinitions: Object.entries(definition.tools).map(([key, tool]) => {
      const candidate = tool as {
        id?: string;
        description?: string;
        inputSchema?: Parameters<typeof standardSchemaToJSONSchema>[0];
        outputSchema?: Parameters<typeof standardSchemaToJSONSchema>[0];
      };
      return {
        key,
        id: candidate.id,
        description: candidate.description,
        inputSchema: candidate.inputSchema ? standardSchemaToJSONSchema(candidate.inputSchema) : undefined,
        outputSchema: candidate.outputSchema ? standardSchemaToJSONSchema(candidate.outputSchema) : undefined,
      };
    }).sort((left, right) => left.key.localeCompare(right.key)),
    skillIds: [...definition.skillIds].sort(),
  }));
  return createHash("sha256").update(serialized).digest("hex");
}

function createMastraAgent(input: AgentFactoryInput): Agent {
  return new Agent({
    id: input.runtimeAgentId,
    name: `${input.name}@${input.agentVersion}`,
    description: `Orbit Agent ${input.agentId} version ${input.agentVersion}`,
    instructions: input.instructions,
    model: input.model,
    tools: input.tools,
    memory: input.memory,
    metadata: {
      orbitAgentId: input.agentId,
      orbitAgentVersion: input.agentVersion,
      adapterVersion: MASTRA_AGENT_DEFINITION_ADAPTER_VERSION,
    },
  });
}

/** 将不可变 Orbit Agent version/config 映射并缓存为进程级 Mastra Agent。 */
export class MastraAgentDefinitionRegistry {
  private readonly agents = new Map<string, RegisteredMastraAgent>();
  private readonly createAgent: (input: AgentFactoryInput) => Agent;

  constructor(private readonly options: RegistryOptions) {
    this.createAgent = options.createAgent ?? createMastraAgent;
  }

  resolve(definition: OrbitMastraAgentDefinition): RegisteredMastraAgent {
    const cacheKey = definitionCacheKey(definition);
    const current = this.agents.get(cacheKey);
    if (current) return current;
    const runtimeAgentId = `orbit-agent-${cacheKey.slice(0, 24)}`;
    const agent = this.createAgent({ ...definition, runtimeAgentId });
    this.options.mastra.addAgent(agent, runtimeAgentId);
    const registered = { runtimeAgentId, cacheKey, agent };
    this.agents.set(cacheKey, registered);
    return registered;
  }
}
