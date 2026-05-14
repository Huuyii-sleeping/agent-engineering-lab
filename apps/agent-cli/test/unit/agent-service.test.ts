import type OpenAI from "openai";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { AgentService, createAgentHttpServer } from "../../src/service-api/index.js";
import { AgentHost } from "../../src/host/agent-host.js";
import type { DeliveryServiceLike } from "../../src/services/delivery-service.js";
import type { HookServiceLike } from "../../src/services/hook-service.js";
import type { AgentRuntimeState } from "../../src/agent-loop.js";
import type { MemoryServiceLike } from "../../src/services/memory-service.js";
import type { ModelPolicyServiceLike } from "../../src/services/model-policy-service.js";
import type { ObservabilityServiceLike } from "../../src/services/observability-service.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { StaticPromptSource } from "../../src/prompt/types.js";
import type { ToolServiceLike } from "../../src/tools/service.js";

const PROMPT_SOURCE: StaticPromptSource = {
  core: "test-core",
  tools: [],
  skills: [],
  rules: [],
};

function createLoopRunner() {
  return {
    run: async ({ messages, runtimeState }: {
      messages: ChatCompletionMessageParam[];
      runtimeState: AgentRuntimeState;
    }): Promise<void> => {
      const latestUser = [...messages].reverse().find((item) => item.role === "user");
      messages.push({
        role: "assistant",
        content: `reply:${runtimeState.sessionId}:${typeof latestUser?.content === "string" ? latestUser.content : ""}`,
      });
    },
  };
}

function createToolService(overrides: Partial<ToolServiceLike> = {}): ToolServiceLike {
  return {
    listTools: async () => [],
    listToolRegistrations: async () => [],
    listToolMetadata: async () => [],
    previewToolCall: () => "",
    runToolByName: async () => "",
    ...overrides,
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

function createMemoryService(): MemoryServiceLike {
  return {
    autoExtract: async () => undefined,
    buildInjectionForQuery: async () => ({
      content: null,
      usedEntries: 0,
      estimatedTokens: 0,
    }),
    runAdd: async () => "",
    runSearch: async () => "",
    runList: async () => "",
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

async function requestServer(server: ReturnType<typeof createAgentHttpServer>, method: string, url: string): Promise<{
  statusCode: number;
  body: Record<string, unknown>;
}> {
  const req = new Readable({
    read() {
      this.push(null);
    },
  }) as Readable & { method?: string; url?: string };
  req.method = method;
  req.url = url;
  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      callback();
    },
  }) as Writable & {
    statusCode: number;
    setHeader(name: string, value: string): void;
  };
  res.statusCode = 200;
  res.setHeader = () => {};

  const finished = new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
  });
  server.emit("request", req, res);
  await finished;
  return {
    statusCode: res.statusCode,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
  };
}

afterEach(() => {
  delete process.env.MODEL_ID;
});

describe("agent service", () => {
  it("creates and lists isolated sessions", () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const first = service.createSession();
    const second = service.createSession();
    const sessions = service.listSessions();
    expect(sessions).toHaveLength(2);
    expect(first.id).not.toBe(second.id);
    expect(sessions[0]?.id).toBe(first.id);
  });

  it("shares session state when multiple services use the same host", () => {
    const sharedDeps = {
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      notificationService: {
        add: async () => undefined,
        drain: async () => [],
      },
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      runtimeCoordinationService: {
        runAutonomyTick: async () => ({ ok: true, action: "idle" }),
        tickScheduler: async () => undefined,
      },
      runtimeServices: undefined,
      queryEngine: createLoopRunner(),
    } as unknown as ConstructorParameters<typeof AgentHost>[0];
    const host = new AgentHost(sharedDeps);
    const first = new AgentService(sharedDeps, host);
    const second = new AgentService(sharedDeps, host);

    const session = first.createSession();

    expect(second.listSessions().map((item) => item.id)).toEqual([session.id]);
  });

  it("keeps chat history isolated per session", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const a = service.createSession();
    const b = service.createSession();

    const resultA = await service.chat({ session_id: a.id, message: "alpha" });
    const resultB = await service.chat({ session_id: b.id, message: "beta" });

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    expect(String(resultA.assistant)).toContain("alpha");
    expect(String(resultB.assistant)).toContain("beta");
    expect(String(resultA.assistant)).not.toContain("beta");
  });

  it("surfaces target-aware tool metadata from the shared tool registration layer", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService({
        listToolMetadata: async () => [
          {
            name: "mcp__demo__echo_upper",
            description: "Echo upper",
            target: "mcp",
            replaySafe: "false",
            serverName: "demo",
            remoteName: "echo_upper",
          },
          {
            name: "read_file",
            description: "Read a file",
            target: "base",
            replaySafe: "true",
          },
        ],
      }),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });

    const tools = await service.toolsMetadata();

    expect(tools).toEqual([
      {
        name: "mcp__demo__echo_upper",
        description: "Echo upper",
        target: "mcp",
        replaySafe: "false",
        serverName: "demo",
        remoteName: "echo_upper",
      },
      {
        name: "read_file",
        description: "Read a file",
        target: "base",
        replaySafe: "true",
      },
    ]);
  });

  it("exposes bridge manifest, session transcript, and service events", async () => {
    const events: string[] = [];
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const unsubscribe = service.subscribeEvents((event) => {
      events.push(event.type);
    });

    const session = service.createSession();
    await service.chat({ session_id: session.id, message: "bridge" });
    unsubscribe();
    const transcript = service.getSessionDetail(session.id);

    expect(service.bridgeManifest()).toMatchObject({
      ok: true,
      capabilities: { events: true, sessions: true },
      endpoints: { events: "/events", sessionDetail: "/sessions/:id" },
    });
    expect(transcript).toMatchObject({
      id: session.id,
      messages: [
        { role: "user", content: "bridge" },
        { role: "assistant" },
      ],
    });
    expect(events).toEqual(["session.created", "chat.started", "chat.completed"]);
  });

  it("serves bridge and session detail endpoints", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const session = service.createSession();
    const server = createAgentHttpServer(service);

    const bridge = await requestServer(server, "GET", "/bridge");
    const detail = await requestServer(server, "GET", `/sessions/${session.id}`);
    const missing = await requestServer(server, "GET", "/sessions/missing");

    expect(bridge.body).toMatchObject({ ok: true, name: "agent-cli-bridge" });
    expect(detail.body).toMatchObject({ ok: true, session: { id: session.id, messages: [] } });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toMatchObject({
      ok: false,
      error: { code: "SESSION_NOT_FOUND" },
    });
  });
});
