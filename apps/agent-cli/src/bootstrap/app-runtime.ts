import type OpenAI from "openai";
import {
  createClient,
  ensureModelConfigured,
  getDefaultModel,
  getStaticPromptSource,
} from "../config.js";
import {
  type DeliveryServiceLike,
  type HookServiceLike,
  type ModelPolicyServiceLike,
  type NotificationServiceLike,
  type ObservabilityServiceLike,
  type RuntimeCoordinationServiceLike,
} from "../services/index.js";
import {
  createRuntimeServices,
  type RuntimeServices,
} from "../services/runtime-services.js";
import type { StaticPromptSource } from "../prompt/types.js";
import type { ToolServiceLike } from "../tools/service.js";

export type AgentAppRuntimeDeps = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  toolService: ToolServiceLike;
  deliveryService: DeliveryServiceLike;
  hookService: HookServiceLike;
  notificationService: NotificationServiceLike;
  modelPolicyService: ModelPolicyServiceLike;
  observabilityService: ObservabilityServiceLike;
  runtimeCoordinationService: RuntimeCoordinationServiceLike;
  runtimeServices: RuntimeServices;
};

type AgentAppRuntimeOverrides = Partial<AgentAppRuntimeDeps>;

export function createAgentAppRuntime(
  overrides: AgentAppRuntimeOverrides = {},
): AgentAppRuntimeDeps {
  if (!overrides.client || !overrides.model || !overrides.promptSource) {
    ensureModelConfigured();
  }
  const client = overrides.client ?? createClient();
  const model = overrides.model ?? getDefaultModel();
  const promptSource = overrides.promptSource ?? getStaticPromptSource();
  const runtimeServices = createRuntimeServices({
    ...overrides.runtimeServices,
    toolService: overrides.toolService ?? overrides.runtimeServices?.toolService,
    deliveryService: overrides.deliveryService ?? overrides.runtimeServices?.deliveryService,
    hookService: overrides.hookService ?? overrides.runtimeServices?.hookService,
    notificationService:
      overrides.notificationService ?? overrides.runtimeServices?.notificationService,
    modelPolicyService:
      overrides.modelPolicyService ?? overrides.runtimeServices?.modelPolicyService,
    observabilityService:
      overrides.observabilityService ?? overrides.runtimeServices?.observabilityService,
    runtimeCoordinationService:
      overrides.runtimeCoordinationService ??
      overrides.runtimeServices?.runtimeCoordinationService,
  });
  return {
    client,
    model,
    promptSource,
    ...runtimeServices,
    runtimeServices,
  };
}
