import type { ToolServiceLike } from "../tools/service.js";
import { DEFAULT_TOOL_SERVICE } from "../tools/service.js";
import { DEFAULT_DELIVERY_SERVICE, type DeliveryServiceLike } from "./delivery-service.js";
import { DEFAULT_HOOK_SERVICE, type HookServiceLike } from "./hook-service.js";
import { DEFAULT_MEMORY_SERVICE, type MemoryServiceLike } from "./memory-service.js";
import {
  DEFAULT_MODEL_POLICY_SERVICE,
  type ModelPolicyServiceLike,
} from "./model-policy-service.js";
import {
  DEFAULT_NOTIFICATION_SERVICE,
  type NotificationServiceLike,
} from "./notification-service.js";
import {
  DEFAULT_OBSERVABILITY_SERVICE,
  type ObservabilityServiceLike,
} from "./observability-service.js";
import {
  DEFAULT_RUNTIME_COORDINATION_SERVICE,
  type RuntimeCoordinationServiceLike,
} from "./runtime-coordination-service.js";

export type RuntimeServices = {
  toolService: ToolServiceLike;
  deliveryService: DeliveryServiceLike;
  hookService: HookServiceLike;
  memoryService: MemoryServiceLike;
  notificationService: NotificationServiceLike;
  modelPolicyService: ModelPolicyServiceLike;
  observabilityService: ObservabilityServiceLike;
  runtimeCoordinationService: RuntimeCoordinationServiceLike;
};

export type RuntimeServiceOverrides = Partial<RuntimeServices>;

export function createRuntimeServices(overrides: RuntimeServiceOverrides = {}): RuntimeServices {
  return {
    toolService: overrides.toolService ?? DEFAULT_TOOL_SERVICE,
    deliveryService: overrides.deliveryService ?? DEFAULT_DELIVERY_SERVICE,
    hookService: overrides.hookService ?? DEFAULT_HOOK_SERVICE,
    memoryService: overrides.memoryService ?? DEFAULT_MEMORY_SERVICE,
    notificationService: overrides.notificationService ?? DEFAULT_NOTIFICATION_SERVICE,
    modelPolicyService: overrides.modelPolicyService ?? DEFAULT_MODEL_POLICY_SERVICE,
    observabilityService: overrides.observabilityService ?? DEFAULT_OBSERVABILITY_SERVICE,
    runtimeCoordinationService:
      overrides.runtimeCoordinationService ?? DEFAULT_RUNTIME_COORDINATION_SERVICE,
  };
}
