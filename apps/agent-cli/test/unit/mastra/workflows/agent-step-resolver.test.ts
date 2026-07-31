import { describe, expect, it, vi } from "vitest";
import { MastraAgentDefinitionRegistry } from "../../../../src/mastra/agents/definition-registry.js";
import { OrbitMastraWorkflowAgentResolver } from "../../../../src/mastra/workflows/agent-step-resolver.js";
import {
  ORBIT_EXECUTOR_KIND_KEY,
  ORBIT_NODE_ID_KEY,
  ORBIT_OWNER_ID_KEY,
  ORBIT_PRODUCT_RUN_ID_KEY,
} from "../../../../src/mastra/tools/tool-execution-adapter.js";

describe("mastra/workflows/agent-step-resolver", () => {
  it("通过共享 Agent registry、model policy 和 Mastra stream 执行 LLM 节点", async () => {
    const stream = vi.fn().mockResolvedValue({
      fullStream: (async function* () {
        yield { type: "text-delta", payload: { text: "hel" } };
        yield { type: "text-delta", payload: { text: "lo" } };
      })(),
      text: Promise.resolve("hello"),
      totalUsage: Promise.resolve({ inputTokens: 2, outputTokens: 1, totalTokens: 3 }),
    });
    const addAgent = vi.fn();
    const registry = new MastraAgentDefinitionRegistry({
      mastra: { addAgent },
      createAgent: () => ({ stream }) as never,
    });
    const finalizeUsage = vi.fn().mockResolvedValue(undefined);
    const resolver = new OrbitMastraWorkflowAgentResolver({
      registry,
      modelPolicyService: {
        selectModel: vi.fn().mockResolvedValue({ model: "gpt-selected", budgetAction: "allow" }),
        finalizeUsage,
      },
      baseUrl: "https://models.example/v1",
      apiKey: "test-key",
    });
    const deltas: string[] = [];
    const result = await resolver.stream({
      workflowId: "workflow-1",
      node: {
        id: "llm",
        type: "llm",
        nodeVersion: 1,
        label: "LLM",
        disabled: false,
        config: { model: "gpt-requested", systemPrompt: "System", prompt: { kind: "literal", value: "hello" }, temperature: 0.2 },
        ports: { inputs: [], outputs: [] },
        executor: { id: "workflow.llm", version: 1 },
        execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: false, onError: "fail" },
      },
      prompt: "hello",
      requestContext: { ownerId: "owner-1" },
      runId: "run-1",
      signal: new AbortController().signal,
      onDelta: (delta) => deltas.push(delta),
    });

    expect(result).toEqual({ text: "hello", usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 } });
    expect(deltas).toEqual(["hel", "lo"]);
    expect(addAgent).toHaveBeenCalledOnce();
    const options = stream.mock.calls[0]?.[1];
    expect(options).toMatchObject({
      runId: "run-1:llm",
      activeTools: [],
      modelSettings: { temperature: 0.2 },
    });
    expect(options.requestContext.get(ORBIT_OWNER_ID_KEY)).toBe("owner-1");
    expect(options.requestContext.get(ORBIT_EXECUTOR_KIND_KEY)).toBe("workflow");
    expect(options.requestContext.get(ORBIT_PRODUCT_RUN_ID_KEY)).toBe("run-1");
    expect(options.requestContext.get(ORBIT_NODE_ID_KEY)).toBe("llm");
    expect(finalizeUsage).toHaveBeenCalledWith(expect.objectContaining({
      promptTokens: 2,
      completionTokens: 1,
      model: "gpt-selected",
      fallbackUsed: true,
    }));
  });
});
