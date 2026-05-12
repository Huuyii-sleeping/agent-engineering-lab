import { once } from "node:events";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AgentService, createAgentHttpServer } from "../../src/agent-service.js";
import type { DeliveryServiceLike } from "../../src/delivery-service.js";
import type { HookServiceLike } from "../../src/hook-service.js";
import type { AgentRuntimeState } from "../../src/agent-loop.js";
import type { ModelPolicyServiceLike } from "../../src/model-policy-service.js";
import type { ObservabilityServiceLike } from "../../src/observability-service.js";
import type { StaticPromptSource } from "../../src/prompt/types.js";
import type { ToolServiceLike } from "../../src/tools/service.js";

const PROMPT_SOURCE: StaticPromptSource = {
  core: "test-core",
  tools: [],
  skills: [],
  rules: [],
};

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createLoopRunner() {
  return {
    run: async ({ messages, runtimeState }: {
      messages: ChatCompletionMessageParam[];
      runtimeState: AgentRuntimeState;
    }): Promise<void> => {
      const latestUser = [...messages].reverse().find((item) => item.role === "user");
      messages.push({
        role: "assistant",
        content: `server-reply:${runtimeState.sessionId}:${typeof latestUser?.content === "string" ? latestUser.content : ""}`,
      });
    },
  };
}

function createToolService(): ToolServiceLike {
  return {
    listTools: async () => [],
    listToolRegistrations: async () => [],
    listToolMetadata: async () => [],
    previewToolCall: () => "",
    runToolByName: async () => "",
  };
}

function createDeliveryService(): DeliveryServiceLike {
  return {
    loadLatestReport: async () => null,
    runValidation: async () => {
      throw new Error("not used");
    },
    runValidateTool: async () => "",
    runReportTool: async () => "",
  };
}

function createHookService(): HookServiceLike {
  return {
    run: async () => ({
      blocked: false,
      blockReason: null,
      messages: [],
      matched: 0,
      executed: 0,
      errors: [],
    }),
  };
}

function createModelPolicyService(): ModelPolicyServiceLike {
  return {
    selectModel: async () => ({
      role: "coding",
      model: "fake-model",
      fallbackModel: null,
      estimatedPromptTokens: 0,
      estimatedPromptCostUsd: 0,
      budgetAction: "allow",
      budgetReason: null,
    }),
    selectFallbackModel: async () => null,
    finalizeUsage: async () => undefined,
  };
}

function createObservabilityService(): ObservabilityServiceLike {
  return {
    createTraceId: () => "trace-test",
    createSpanId: () => "span-test",
    withExecutionContext: async (_context, fn) => fn(),
    recordEvent: async () => ({
      schemaVersion: 1,
      id: "evt-test",
      at: 0,
      trace_id: "trace-test",
      span_id: null,
      kind: "test",
      payload: {},
    }),
  };
}

async function main(): Promise<void> {
  const service = new AgentService({
    client: {} as OpenAI,
    model: "fake-model",
    promptSource: PROMPT_SOURCE,
    toolService: createToolService(),
    deliveryService: createDeliveryService(),
    hookService: createHookService(),
    modelPolicyService: createModelPolicyService(),
    observabilityService: createObservabilityService(),
    queryEngine: createLoopRunner(),
  });
  const server = createAgentHttpServer(service);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind test server");
  }
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${base}/health`).then((res) => res.json() as Promise<{ ok: boolean }>);
    assert(health.ok === true, "health endpoint should return ok");

    const created = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then((res) => res.json() as Promise<{ ok: boolean; session: { id: string } }>);
    assert(created.ok === true && created.session.id, "sessions endpoint should create a session");

    const chat = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: created.session.id, message: "hello api" }),
    }).then((res) => res.json() as Promise<{ ok: boolean; assistant: string }>);
    assert(chat.ok === true, "chat endpoint should succeed");
    assert(chat.assistant.includes("hello api"), "chat endpoint should return assistant content");

    const sessions = await fetch(`${base}/sessions`).then(
      (res) => res.json() as Promise<{ ok: boolean; sessions: Array<{ id: string; messageCount: number }> }>,
    );
    assert(sessions.ok === true, "sessions endpoint should list sessions");
    assert(sessions.sessions[0]?.messageCount === 2, "session history should keep user and assistant messages");

    console.log("PRD12_SERVICE_API_SMOKE_OK");
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error("PRD12_SERVICE_API_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
