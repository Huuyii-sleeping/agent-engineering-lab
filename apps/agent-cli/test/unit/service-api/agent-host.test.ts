import type OpenAI from "openai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AgentHost } from "../../../src/host/agent-host.js";
import { createAgentSessionRecord } from "../../../src/service-api/sessions.js";
import { SessionStore } from "../../../src/service-api/session-store.js";
import type { StaticPromptSource } from "../../../src/prompt/types.js";
import type { ToolServiceLike } from "../../../src/tools/service.js";
import type { DeliveryServiceLike } from "../../../src/services/delivery-service.js";
import type { HookServiceLike } from "../../../src/services/hook-service.js";
import type { MemoryServiceLike } from "../../../src/services/memory-service.js";
import type { ModelPolicyServiceLike } from "../../../src/services/model-policy-service.js";
import type { ObservabilityServiceLike } from "../../../src/services/observability-service.js";
import type { NotificationServiceLike, RuntimeCoordinationServiceLike } from "../../../src/services/index.js";
import type { AgentRuntimeState, QueryEngineLike } from "../../../src/runtime/query-types.js";
import type { AgentAppRuntimeDeps } from "../../../src/bootstrap/app-runtime.js";

const PROMPT_SOURCE: StaticPromptSource = {
  core: "test-core",
  tools: [],
  skills: [],
  rules: [],
};

let tempDir = "";

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

function createNotificationService(): NotificationServiceLike {
  return {
    add: async () => undefined,
    drain: async () => [],
  };
}

function createRuntimeCoordinationService(): RuntimeCoordinationServiceLike {
  return {
    runAutonomyTick: async () => ({ ok: true, action: "idle" }),
    tickScheduler: async () => undefined,
  };
}

function createQueryEngine(): QueryEngineLike {
  return {
    run: async ({ messages, runtimeState }: {
      messages: ChatCompletionMessageParam[];
      runtimeState: AgentRuntimeState;
    }) => {
      messages.push({ role: "assistant", content: `reply:${runtimeState.sessionId}` });
    },
  };
}

function createDeps(): AgentAppRuntimeDeps {
  const toolService = createToolService();
  const deliveryService = createDeliveryService();
  const hookService = createHookService();
  const memoryService = createMemoryService();
  const notificationService = createNotificationService();
  const modelPolicyService = createModelPolicyService();
  const observabilityService = createObservabilityService();
  const runtimeCoordinationService = createRuntimeCoordinationService();
  const queryEngine = createQueryEngine();
  return {
    client: {} as OpenAI,
    model: "fake-model",
    promptSource: PROMPT_SOURCE,
    toolService,
    deliveryService,
    hookService,
    memoryService,
    notificationService,
    modelPolicyService,
    observabilityService,
    runtimeCoordinationService,
    runtimeServices: {
      toolService,
      deliveryService,
      hookService,
      memoryService,
      notificationService,
      modelPolicyService,
      observabilityService,
      runtimeCoordinationService,
    },
    queryEngine,
  };
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    tempDir = "";
  }
});

describe("host/agent-host", () => {
  it("loads persisted sessions on initialize", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-host-test-"));
    const sessionStore = new SessionStore(path.join(tempDir, ".sessions"));
    const session = createAgentSessionRecord("session_1", 1000);
    session.history.push({ role: "user", content: "restore me" });
    await sessionStore.save(session);

    const host = new AgentHost(createDeps(), sessionStore);
    await host.initialize();

    expect(host.listSessions().map((item) => item.id)).toEqual(["session_1"]);
    expect(host.getSession("session_1")?.history).toEqual([{ role: "user", content: "restore me" }]);
  });

  it("persists created sessions through the backing store", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-host-test-"));
    const sessionStore = new SessionStore(path.join(tempDir, ".sessions"));
    const host = new AgentHost(createDeps(), sessionStore);
    await host.initialize();

    const session = await host.createSession();
    const restored = await sessionStore.load(session.id);

    expect(restored).not.toBeNull();
    expect(restored?.id).toBe(session.id);
    expect(host.listSessions().map((item) => item.id)).toEqual([session.id]);
  });

  it("owns a shared session-created event stream with monotonic ids", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-host-test-"));
    const host = new AgentHost(createDeps(), new SessionStore(path.join(tempDir, ".sessions")));
    await host.initialize();

    const seen: Array<{ id: number; type: string; sessionId: string }> = [];
    const unsubscribe = host.subscribeEvents((event) => {
      seen.push({
        id: event.id,
        type: event.type,
        sessionId: String((event.payload.session as { id?: unknown } | undefined)?.id ?? ""),
      });
    });

    const first = host.createSessionSync();
    const second = host.createSessionSync();
    unsubscribe();

    expect(seen).toEqual([
      { id: 0, type: "session.created", sessionId: first.id },
      { id: 1, type: "session.created", sessionId: second.id },
    ]);
  });
});
