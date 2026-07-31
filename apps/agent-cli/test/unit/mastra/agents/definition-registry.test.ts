import { describe, expect, it, vi } from "vitest";
import {
  MastraAgentDefinitionRegistry,
  type OrbitMastraAgentDefinition,
} from "../../../../src/mastra/agents/definition-registry.js";
import {
  getOrCreateMastraRuntime,
  shutdownMastraRuntime,
} from "../../../../src/mastra/instance/factory.js";

function definition(overrides: Partial<OrbitMastraAgentDefinition> = {}): OrbitMastraAgentDefinition {
  return {
    agentId: "agent-1",
    agentVersion: "v1",
    name: "Agent One",
    instructions: ["You are helpful."],
    model: {
      providerId: "openai",
      modelId: "gpt-test",
      url: "https://models.example/v1",
      apiKey: "top-secret",
    },
    tools: {},
    toolIds: ["read_file"],
    skillIds: ["review"],
    ...overrides,
  };
}

describe("mastra/agents/definition-registry", () => {
  it("按 Agent 版本、模型、instructions、Tool/Skill binding 和 adapterVersion 缓存 definition", () => {
    const addAgent = vi.fn();
    const created: object[] = [];
    const registry = new MastraAgentDefinitionRegistry({
      mastra: { addAgent },
      createAgent: (input) => {
        const agent = { id: input.runtimeAgentId };
        created.push(agent);
        return agent as never;
      },
    });

    const first = registry.resolve(definition());
    const same = registry.resolve(definition());
    const nextVersion = registry.resolve(definition({ agentVersion: "v2" }));
    const nextModel = registry.resolve(definition({
      model: { providerId: "openai", modelId: "gpt-next", apiKey: "top-secret" },
    }));
    const nextInstructions = registry.resolve(definition({ instructions: ["Different"] }));
    const nextTools = registry.resolve(definition({ toolIds: ["write_file"] }));
    const nextSkills = registry.resolve(definition({ skillIds: ["testing"] }));

    expect(same).toBe(first);
    expect(nextVersion).not.toBe(first);
    expect(nextModel).not.toBe(first);
    expect(nextInstructions).not.toBe(first);
    expect(nextTools).not.toBe(first);
    expect(nextSkills).not.toBe(first);
    expect(created).toHaveLength(6);
    expect(addAgent).toHaveBeenCalledTimes(6);
    expect(first.runtimeAgentId).toMatch(/^orbit-agent-/);
    expect(first.runtimeAgentId).not.toContain("top-secret");
  });

  it("将真实 Agent 动态注册到共享 Mastra Instance", async () => {
    const root = `/tmp/orbit-mastra-agent-registry-${process.pid}-${Date.now()}`;
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    try {
      const registry = new MastraAgentDefinitionRegistry({ mastra: runtime.mastra });
      const registered = registry.resolve(definition());

      expect(runtime.mastra.getAgentById(registered.runtimeAgentId)).toBe(registered.agent);
    } finally {
      await shutdownMastraRuntime({ root, persistenceEnabled: false });
    }
  });
});
