import type OpenAI from "openai";
import {
  createClient,
  ensureModelConfigured,
  getDefaultModel,
  getStaticPromptSource,
} from "../config.js";
import { DEFAULT_DELIVERY_SERVICE, type DeliveryServiceLike } from "../delivery-service.js";
import { DEFAULT_HOOK_SERVICE, type HookServiceLike } from "../hook-service.js";
import { DEFAULT_MEMORY_SERVICE, type MemoryServiceLike } from "../memory-service.js";
import {
  DEFAULT_NOTIFICATION_SERVICE,
  type NotificationServiceLike,
} from "../notification-service.js";
import {
  DEFAULT_MODEL_POLICY_SERVICE,
  type ModelPolicyServiceLike,
} from "../model-policy-service.js";
import {
  DEFAULT_OBSERVABILITY_SERVICE,
  type ObservabilityServiceLike,
} from "../observability-service.js";
import type { StaticPromptSource } from "../prompt/types.js";
import { QueryEngine } from "../runtime/query-engine.js";
import type { AgentRuntimeState, QueryEngineLike } from "../runtime/query-types.js";
import {
  DEFAULT_RUNTIME_COORDINATION_SERVICE,
  type RuntimeCoordinationServiceLike,
} from "../runtime-coordination-service.js";
import { DEFAULT_TOOL_SERVICE, type ToolServiceLike } from "../tools/service.js";

export type AgentAppRuntimeDeps = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  toolService: ToolServiceLike;
  deliveryService: DeliveryServiceLike;
  hookService: HookServiceLike;
  memoryService: MemoryServiceLike;
  notificationService: NotificationServiceLike;
  modelPolicyService: ModelPolicyServiceLike;
  observabilityService: ObservabilityServiceLike;
  runtimeCoordinationService: RuntimeCoordinationServiceLike;
  queryEngine: QueryEngineLike;
};

type AgentAppRuntimeOverrides = Partial<AgentAppRuntimeDeps>;

export function createAgentRuntimeState(sessionId: string): AgentRuntimeState {
  return {
    sessionId,
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

export function createAgentAppRuntime(
  overrides: AgentAppRuntimeOverrides = {},
): AgentAppRuntimeDeps {
  if (!overrides.client || !overrides.model || !overrides.promptSource) {
    ensureModelConfigured();
  }
  const client = overrides.client ?? createClient();
  const model = overrides.model ?? getDefaultModel();
  const promptSource = overrides.promptSource ?? getStaticPromptSource();
  const toolService = overrides.toolService ?? DEFAULT_TOOL_SERVICE;
  const deliveryService = overrides.deliveryService ?? DEFAULT_DELIVERY_SERVICE;
  const hookService = overrides.hookService ?? DEFAULT_HOOK_SERVICE;
  const memoryService = overrides.memoryService ?? DEFAULT_MEMORY_SERVICE;
  const notificationService = overrides.notificationService ?? DEFAULT_NOTIFICATION_SERVICE;
  const modelPolicyService = overrides.modelPolicyService ?? DEFAULT_MODEL_POLICY_SERVICE;
  const observabilityService = overrides.observabilityService ?? DEFAULT_OBSERVABILITY_SERVICE;
  const runtimeCoordinationService =
    overrides.runtimeCoordinationService ?? DEFAULT_RUNTIME_COORDINATION_SERVICE;
  return {
    client,
    model,
    promptSource,
    toolService,
    deliveryService,
    hookService,
    memoryService,
    notificationService,
    modelPolicyService,
    observabilityService,
    runtimeCoordinationService,
    queryEngine:
      overrides.queryEngine ??
      new QueryEngine({
        client,
        model,
        promptSource,
        toolService,
        deliveryService,
        hookService,
        memoryService,
        notificationService,
        modelPolicyService,
        observabilityService,
        runtimeCoordinationService,
      }),
  };
}
