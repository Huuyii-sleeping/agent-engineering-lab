import { MODEL_POLICY, type ModelRole, type ModelSelection } from "../model-policy.js";

export type ModelPolicyFinalizeUsage = {
  promptTokens: number;
  completionTokens: number;
  model: string;
  role: ModelRole;
  latencyMs: number;
  fallbackUsed: boolean;
};

export type ModelPolicyServiceLike = {
  selectModel(role: ModelRole, defaultModel: string, estimatedPromptTokens: number): Promise<ModelSelection>;
  selectFallbackModel(
    role: ModelRole,
    defaultModel: string,
    estimatedPromptTokens: number,
    excludeModel: string,
  ): Promise<ModelSelection | null>;
  finalizeUsage(usage: ModelPolicyFinalizeUsage, traceId?: string): Promise<void>;
};

export class ModelPolicyService implements ModelPolicyServiceLike {
  async selectModel(role: ModelRole, defaultModel: string, estimatedPromptTokens: number): Promise<ModelSelection> {
    return MODEL_POLICY.selectModel(role, defaultModel, estimatedPromptTokens);
  }

  async selectFallbackModel(
    role: ModelRole,
    defaultModel: string,
    estimatedPromptTokens: number,
    excludeModel: string,
  ): Promise<ModelSelection | null> {
    return MODEL_POLICY.selectFallbackModel(role, defaultModel, estimatedPromptTokens, excludeModel);
  }

  async finalizeUsage(usage: ModelPolicyFinalizeUsage, traceId?: string): Promise<void> {
    return MODEL_POLICY.finalizeUsage(usage, traceId);
  }
}

export const DEFAULT_MODEL_POLICY_SERVICE = new ModelPolicyService();
