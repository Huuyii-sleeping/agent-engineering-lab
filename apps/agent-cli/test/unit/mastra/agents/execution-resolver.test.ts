import { describe, expect, it, vi } from "vitest";
import type { GenerateAgentCommand } from "@orbit/runtime-contracts";
import { MastraAgentDefinitionRegistry } from "../../../../src/mastra/agents/definition-registry.js";
import { OrbitMastraAgentExecutionResolver } from "../../../../src/mastra/agents/execution-resolver.js";

const command: GenerateAgentCommand = {
  agentId: "agent-1",
  agentVersion: "version-7",
  sessionId: "session-1",
  resourceId: "resource-1",
  threadId: "thread-1",
  messages: [{ role: "user", content: "hello" }],
  requestContext: { tenantId: "tenant-1", apiKey: "request-secret" },
  policy: {
    allowedToolIds: ["read_file"],
    allowedSkillIds: ["review"],
  },
};

describe("mastra/agents/execution-resolver", () => {
  it("复用 model policy、prompt builder、Tool/Skill resolver 和 Memory identity 装配 Mastra Agent", async () => {
    let capturedDefinition: Record<string, unknown> | undefined;
    const fakeAgent = {
      generate: vi.fn(),
      stream: vi.fn(),
      abortRunStream: vi.fn(),
    };
    const registry = new MastraAgentDefinitionRegistry({
      mastra: { addAgent: vi.fn() },
      createAgent: (input) => {
        capturedDefinition = input as unknown as Record<string, unknown>;
        return fakeAgent as never;
      },
    });
    const selectModel = vi.fn().mockResolvedValue({ model: "selected-model", fallbackUsed: false });
    const finalizeUsage = vi.fn().mockResolvedValue(undefined);
    const resolver = new OrbitMastraAgentExecutionResolver({
      registry,
      modelPolicyService: {
        selectModel,
        selectFallbackModel: vi.fn().mockResolvedValue(null),
        finalizeUsage,
      },
      defaultModel: "default-model",
      promptSource: {
        core: "Core instruction",
        tools: ["Use governed tools"],
        skills: [],
        rules: ["Never leak secrets"],
      },
      resolveTools: vi.fn().mockResolvedValue({ read_file: { id: "read_file" } }),
      resolveSkillInstructions: vi.fn().mockResolvedValue(["Review skill instruction"]),
      memory: {} as never,
      baseUrl: "https://models.example/v1",
      apiKey: "model-secret",
    });

    const resolved = await resolver.resolve(command, {
      mastraResourceId: "mastra-resource-1",
      mastraThreadId: "mastra-thread-1",
    });

    expect(selectModel).toHaveBeenCalledWith("coding", "default-model", expect.any(Number));
    expect(capturedDefinition).toMatchObject({
      agentId: "agent-1",
      agentVersion: "version-7",
      model: {
        providerId: "openai",
        modelId: "selected-model",
        url: "https://models.example/v1",
        apiKey: "model-secret",
      },
      toolIds: ["read_file"],
      skillIds: ["review"],
    });
    expect((capturedDefinition?.instructions as string[]).join("\n")).toContain("Core instruction");
    expect((capturedDefinition?.instructions as string[]).join("\n")).toContain("Review skill instruction");
    expect(resolved.executionOptions.memory).toEqual({
      resource: "mastra-resource-1",
      thread: "mastra-thread-1",
    });
    expect(resolved.executionOptions.activeTools).toEqual(["read_file"]);
    expect(resolved.executionOptions.requestContext.get("tenantId")).toBe("tenant-1");
    expect(resolved.executionOptions.requestContext.get("orbitAgentId")).toBe("agent-1");

    await resolved.finalizeUsage({ inputTokens: 3, outputTokens: 2, totalTokens: 5 }, 25);
    expect(finalizeUsage).toHaveBeenCalledWith(expect.objectContaining({
      promptTokens: 3,
      completionTokens: 2,
      model: "selected-model",
      role: "coding",
      latencyMs: 25,
    }));
  });
});
