import type OpenAI from "openai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentAppRuntimeDeps } from "../../src/bootstrap/app-runtime.js";
import { AgentHost } from "../../src/host/agent-host.js";
import type { StaticPromptSource } from "../../src/prompt/types.js";
import { QueryEngine } from "../../src/runtime/query-engine.js";
import { AgentService } from "../../src/service-api/index.js";
import { SessionStore } from "../../src/service-api/session-store.js";
import type {
  DeliveryServiceLike,
  HookServiceLike,
  MemoryServiceLike,
  ModelPolicyServiceLike,
  NotificationServiceLike,
  PendingQueryNotifications,
  ObservabilityServiceLike,
  RuntimeCoordinationServiceLike,
  RuntimeServices,
} from "../../src/services/index.js";
import type { ToolServiceLike } from "../../src/tools/service.js";
import type { HarnessAgentScenarioStepResult } from "./agent.js";
import { createDeterministicOpenAIClient } from "./openai-client.js";
import { withHarnessWorkspace } from "./workspace.js";

const SCENARIO_NAME = "service-session-resume";

type ServiceSessionResumeResult = {
  name: string;
  status: "passed" | "failed";
  failedStep: string | null;
  steps: HarnessAgentScenarioStepResult[];
};

type ServiceRuntime = {
  service: AgentService;
  store: SessionStore;
};

const PROMPT_SOURCE: StaticPromptSource = {
  core: "harness service session core",
  tools: [],
  skills: [],
  rules: [],
};

function createToolService(): ToolServiceLike {
  return {
    listTools: async () => [],
    listToolRegistrations: async () => [],
    listToolMetadata: async () => [],
    previewToolCall: (name, argumentsJson) => `${name}(${argumentsJson})`,
    runToolByName: async () => "",
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

function createNotificationService(): NotificationServiceLike {
  return {
    drainPendingQueryNotifications: async (): Promise<PendingQueryNotifications> => ({
      scheduled: [],
      subagent: [],
      background: [],
      team: [],
    }),
  };
}

function createDeliveryService(): DeliveryServiceLike {
  return {
    loadLatestReport: async () => null,
    runValidation: async () => {
      throw new Error("delivery validation is not used by service session harness");
    },
    runValidateTool: async () => "",
    runReportTool: async () => "",
  };
}

function createModelPolicyService(): ModelPolicyServiceLike {
  return {
    selectModel: async () => ({
      role: "coding",
      model: "harness-model",
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
  let eventCounter = 0;
  return {
    createTraceId: () => `trace-${eventCounter}`,
    createSpanId: () => `span-${eventCounter}`,
    withExecutionContext: async (_context, fn) => fn(),
    recordEvent: async (kind, payload, context) => {
      const id = `evt-${eventCounter}`;
      eventCounter += 1;
      return {
        schemaVersion: 1,
        id,
        at: eventCounter,
        trace_id: context?.traceId ?? "trace-service-session",
        span_id: context?.spanId ?? null,
        kind,
        payload,
      };
    },
  };
}

function createRuntimeCoordinationService(): RuntimeCoordinationServiceLike {
  return {
    runAutonomyTick: async () => ({ ok: true, action: "idle" }),
    tickScheduler: async () => undefined,
  };
}

async function createServiceRuntime(root: string, assistantReplies: string[]): Promise<ServiceRuntime> {
  const client = createDeterministicOpenAIClient(
    assistantReplies.map((content) => ({ type: "message", content })),
  );
  const toolService = createToolService();
  const hookService = createHookService();
  const memoryService = createMemoryService();
  const notificationService = createNotificationService();
  const deliveryService = createDeliveryService();
  const modelPolicyService = createModelPolicyService();
  const observabilityService = createObservabilityService();
  const runtimeCoordinationService = createRuntimeCoordinationService();
  const runtimeServices: RuntimeServices = {
    toolService,
    hookService,
    memoryService,
    notificationService,
    deliveryService,
    modelPolicyService,
    observabilityService,
    runtimeCoordinationService,
  };
  const queryEngine = new QueryEngine({
    client: client as OpenAI,
    model: "harness-model",
    promptSource: PROMPT_SOURCE,
    runtimeServices,
  });
  const deps: AgentAppRuntimeDeps = {
    client: client as OpenAI,
    model: "harness-model",
    promptSource: PROMPT_SOURCE,
    toolService,
    deliveryService,
    hookService,
    memoryService,
    notificationService,
    modelPolicyService,
    observabilityService,
    runtimeCoordinationService,
    runtimeServices,
    queryEngine,
  };
  const store = new SessionStore(path.join(root, ".sessions"));
  const host = new AgentHost(deps, store);
  await host.initialize();
  return {
    service: new AgentService(deps, host),
    store,
  };
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readOkChatSessionId(result: Record<string, unknown>): string {
  assertCondition(result.ok === true, `chat failed: ${JSON.stringify(result)}`);
  const session = result.session as { id?: unknown } | undefined;
  assertCondition(typeof session?.id === "string", "chat result did not include session id");
  return session.id;
}

async function readJournalRows(root: string, sessionId: string): Promise<unknown[]> {
  const raw = await readFile(path.join(root, ".sessions", `session_${sessionId}.jsonl`), "utf8");
  return raw
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

async function runServiceSessionResumeAssertions(root: string): Promise<void> {
  const firstRuntime = await createServiceRuntime(root, ["alpha first", "beta first"]);
  const firstAlpha = await firstRuntime.service.chat({ message: "alpha user" });
  const firstBeta = await firstRuntime.service.chat({ message: "beta user" });
  const alphaSessionId = readOkChatSessionId(firstAlpha);
  const betaSessionId = readOkChatSessionId(firstBeta);

  const persistedAlphaBeforeRestart = await firstRuntime.store.load(alphaSessionId);
  assertCondition(persistedAlphaBeforeRestart !== null, "alpha session was not persisted");
  assertCondition(
    persistedAlphaBeforeRestart.runtimeState.roundCounter === 1,
    "alpha session did not persist first round counter",
  );

  const secondRuntime = await createServiceRuntime(root, ["alpha resumed", "beta resumed"]);
  assertCondition(
    secondRuntime.service.listSessions().map((session) => session.id).join(",") ===
      [alphaSessionId, betaSessionId].join(","),
    "restarted service did not list persisted sessions",
  );

  const secondAlpha = await secondRuntime.service.chat({
    session_id: alphaSessionId,
    message: "alpha after restart",
  });
  const secondBeta = await secondRuntime.service.chat({
    session_id: betaSessionId,
    message: "beta after restart",
  });
  assertCondition(
    readOkChatSessionId(secondAlpha) === alphaSessionId,
    "alpha resume changed the session id",
  );
  assertCondition(readOkChatSessionId(secondBeta) === betaSessionId, "beta resume changed the session id");

  const restoredAlpha = await secondRuntime.store.load(alphaSessionId);
  const restoredBeta = await secondRuntime.store.load(betaSessionId);
  assertCondition(restoredAlpha !== null, "alpha session was not loadable after resumed chat");
  assertCondition(restoredBeta !== null, "beta session was not loadable after resumed chat");
  assertCondition(restoredAlpha.runtimeState.roundCounter === 2, "alpha round counter was not continuous");
  assertCondition(restoredBeta.runtimeState.roundCounter === 2, "beta round counter was not continuous");

  const alphaMessages = JSON.stringify(restoredAlpha.history);
  const betaMessages = JSON.stringify(restoredBeta.history);
  assertCondition(alphaMessages.includes("alpha user"), "alpha history lost initial user message");
  assertCondition(alphaMessages.includes("alpha resumed"), "alpha history lost resumed assistant message");
  assertCondition(!alphaMessages.includes("beta user"), "alpha history leaked beta message");
  assertCondition(betaMessages.includes("beta user"), "beta history lost initial user message");
  assertCondition(betaMessages.includes("beta resumed"), "beta history lost resumed assistant message");
  assertCondition(!betaMessages.includes("alpha user"), "beta history leaked alpha message");

  const alphaJournalRows = await readJournalRows(root, alphaSessionId);
  assertCondition(alphaJournalRows.length >= 2, "alpha journal was not append-only across resume");
}

/** Runs the production service-level session resume harness scenario. */
export async function runHarnessServiceSessionResumeScenario(): Promise<ServiceSessionResumeResult> {
  const steps: HarnessAgentScenarioStepResult[] = [];
  let failedStep: string | null = null;

  await withHarnessWorkspace({ name: SCENARIO_NAME }, async (workspace) => {
    try {
      await runServiceSessionResumeAssertions(workspace.root);
      steps.push({ name: "service session resume", status: "passed" });
    } catch (error) {
      failedStep = "service session resume";
      steps.push({
        name: "service session resume",
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    name: SCENARIO_NAME,
    status: failedStep ? "failed" : "passed",
    failedStep,
    steps,
  };
}
