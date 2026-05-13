import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { recordObservabilityEvent } from "./observability/runtime.js";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import { nowTimestampMs } from "./time.js";

export type ModelRole = "planning" | "coding" | "review" | "ops";

type RolePolicy = {
  primary: string;
  fallback: string | null;
};

type BudgetState = {
  schemaVersion: number;
  updatedAt: number;
  sessionPromptTokens: number;
  sessionCompletionTokens: number;
  dailyPromptTokens: number;
  dailyCompletionTokens: number;
  dayKey: string;
};

export type ModelSelection = {
  role: ModelRole;
  model: string;
  fallbackModel: string | null;
  estimatedPromptTokens: number;
  estimatedPromptCostUsd: number;
  budgetAction: "allow" | "downgrade" | "deny";
  budgetReason: string | null;
};

export type ModelUsageSnapshot = {
  model: string;
  sessionPromptTokens: number;
  sessionCompletionTokens: number;
  dailyPromptTokens: number;
  dailyCompletionTokens: number;
  sessionEstimatedCostUsd: number;
  dailyEstimatedCostUsd: number;
  sessionTokenBudget: number;
  dailyTokenBudget: number;
  dayKey: string;
};

type FinalizeUsage = {
  promptTokens: number;
  completionTokens: number;
  model: string;
  role: ModelRole;
  latencyMs: number;
  fallbackUsed: boolean;
};

const COST_TABLE: Record<string, { promptUsdPer1k: number; completionUsdPer1k: number }> = {
  "gpt-5": { promptUsdPer1k: 0.01, completionUsdPer1k: 0.03 },
  "gpt-5-mini": { promptUsdPer1k: 0.002, completionUsdPer1k: 0.006 },
  "gpt-4o": { promptUsdPer1k: 0.005, completionUsdPer1k: 0.015 },
  "gpt-4o-mini": { promptUsdPer1k: 0.001, completionUsdPer1k: 0.003 },
  unknown: { promptUsdPer1k: 0.004, completionUsdPer1k: 0.012 },
};

function dayKeyFromNow(): string {
  return new Date().toISOString().slice(0, 10);
}

function costEntry(model: string): { promptUsdPer1k: number; completionUsdPer1k: number } {
  const exact = COST_TABLE[model];
  if (exact) {
    return exact;
  }
  const matched = Object.entries(COST_TABLE).find(([key]) => key !== "unknown" && model.includes(key));
  return matched?.[1] ?? COST_TABLE.unknown;
}

export function estimatePromptCostUsd(model: string, promptTokens: number): number {
  const pricing = costEntry(model);
  return Number(((promptTokens / 1000) * pricing.promptUsdPer1k).toFixed(6));
}

export function estimateCompletionCostUsd(model: string, completionTokens: number): number {
  const pricing = costEntry(model);
  return Number(((completionTokens / 1000) * pricing.completionUsdPer1k).toFixed(6));
}

export function estimateTotalCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  return Number((estimatePromptCostUsd(model, promptTokens) + estimateCompletionCostUsd(model, completionTokens)).toFixed(6));
}

function readRolePolicy(role: ModelRole, defaultModel: string): RolePolicy {
  const upper = role.toUpperCase();
  const primary = process.env[`MODEL_${upper}`]?.trim() || defaultModel;
  const fallback = process.env[`MODEL_${upper}_FALLBACK`]?.trim() || process.env.MODEL_FALLBACK?.trim() || null;
  return { primary, fallback };
}

function defaultBudgetState(): BudgetState {
  return {
    schemaVersion: 1,
    updatedAt: nowTimestampMs(),
    sessionPromptTokens: 0,
    sessionCompletionTokens: 0,
    dailyPromptTokens: 0,
    dailyCompletionTokens: 0,
    dayKey: dayKeyFromNow(),
  };
}

export class ModelPolicyManager {
  private readonly runtimeRoot = path.join(process.cwd(), ".runtime");
  private readonly budgetPath = path.join(this.runtimeRoot, "model_budget.json");
  private budgetCache: BudgetState | null = null;

  private async ensureState(): Promise<BudgetState> {
    if (this.budgetCache) {
      if (this.budgetCache.dayKey !== dayKeyFromNow()) {
        this.budgetCache.dailyPromptTokens = 0;
        this.budgetCache.dailyCompletionTokens = 0;
        this.budgetCache.dayKey = dayKeyFromNow();
      }
      return this.budgetCache;
    }
    await mkdir(this.runtimeRoot, { recursive: true });
    try {
      const raw = await readFile(this.budgetPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<BudgetState>;
      this.budgetCache = {
        ...defaultBudgetState(),
        ...parsed,
        dayKey: parsed.dayKey === dayKeyFromNow() ? parsed.dayKey : dayKeyFromNow(),
      };
      if (parsed.dayKey !== dayKeyFromNow()) {
        this.budgetCache.dailyPromptTokens = 0;
        this.budgetCache.dailyCompletionTokens = 0;
      }
    } catch {
      this.budgetCache = defaultBudgetState();
    }
    return this.budgetCache;
  }

  private async saveState(): Promise<void> {
    const state = await this.ensureState();
    state.updatedAt = nowTimestampMs();
    await writeFile(this.budgetPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async selectModel(role: ModelRole, defaultModel: string, estimatedPromptTokens: number): Promise<ModelSelection> {
    const policy = readRolePolicy(role, defaultModel);
    const state = await this.ensureState();
    const sessionProjected = state.sessionPromptTokens + state.sessionCompletionTokens + estimatedPromptTokens;
    const dailyProjected = state.dailyPromptTokens + state.dailyCompletionTokens + estimatedPromptTokens;

    const overSession = sessionProjected > RUNTIME_CONFIG.modelSessionTokenBudget;
    const overDaily = dailyProjected > RUNTIME_CONFIG.modelDailyTokenBudget;
    if (!overSession && !overDaily) {
      return {
        role,
        model: policy.primary,
        fallbackModel: policy.fallback,
        estimatedPromptTokens,
        estimatedPromptCostUsd: estimatePromptCostUsd(policy.primary, estimatedPromptTokens),
        budgetAction: "allow",
        budgetReason: null,
      };
    }

    if (policy.fallback && policy.fallback !== policy.primary) {
      return {
        role,
        model: policy.fallback,
        fallbackModel: null,
        estimatedPromptTokens,
        estimatedPromptCostUsd: estimatePromptCostUsd(policy.fallback, estimatedPromptTokens),
        budgetAction: "downgrade",
        budgetReason: overSession ? "session_budget_exceeded" : "daily_budget_exceeded",
      };
    }

    return {
      role,
      model: policy.primary,
      fallbackModel: policy.fallback,
      estimatedPromptTokens,
      estimatedPromptCostUsd: estimatePromptCostUsd(policy.primary, estimatedPromptTokens),
      budgetAction: "deny",
      budgetReason: overSession ? "session_budget_exceeded" : "daily_budget_exceeded",
    };
  }

  async selectFallbackModel(
    role: ModelRole,
    defaultModel: string,
    estimatedPromptTokens: number,
    excludeModel: string,
  ): Promise<ModelSelection | null> {
    const selection = await this.selectModel(role, defaultModel, estimatedPromptTokens);
    if (!selection.fallbackModel || selection.fallbackModel === excludeModel) {
      return null;
    }
    return {
      ...selection,
      model: selection.fallbackModel,
      fallbackModel: null,
      budgetAction: "downgrade",
      budgetReason: selection.budgetReason ?? "request_fallback",
      estimatedPromptCostUsd: estimatePromptCostUsd(selection.fallbackModel, estimatedPromptTokens),
    };
  }

  async finalizeUsage(usage: FinalizeUsage, traceId?: string): Promise<void> {
    const state = await this.ensureState();
    state.sessionPromptTokens += usage.promptTokens;
    state.sessionCompletionTokens += usage.completionTokens;
    state.dailyPromptTokens += usage.promptTokens;
    state.dailyCompletionTokens += usage.completionTokens;
    await this.saveState();
    await recordObservabilityEvent(
      "model_policy_usage",
      {
        role: usage.role,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        estimatedCostUsd:
          estimatePromptCostUsd(usage.model, usage.promptTokens) +
          estimateCompletionCostUsd(usage.model, usage.completionTokens),
        latencyMs: usage.latencyMs,
        fallbackUsed: usage.fallbackUsed,
        sessionPromptTokens: state.sessionPromptTokens,
        sessionCompletionTokens: state.sessionCompletionTokens,
        dailyPromptTokens: state.dailyPromptTokens,
        dailyCompletionTokens: state.dailyCompletionTokens,
      },
      traceId ? { traceId } : undefined,
    );
  }
}

export async function readModelUsageSnapshot(model = process.env.MODEL_ID?.trim() || "unknown"): Promise<ModelUsageSnapshot> {
  const runtimeRoot = path.join(process.cwd(), ".runtime");
  const budgetPath = path.join(runtimeRoot, "model_budget.json");
  let state = defaultBudgetState();
  try {
    const raw = await readFile(budgetPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<BudgetState>;
    state = {
      ...defaultBudgetState(),
      ...parsed,
      dayKey: parsed.dayKey === dayKeyFromNow() ? parsed.dayKey : dayKeyFromNow(),
    };
    if (parsed.dayKey !== dayKeyFromNow()) {
      state.dailyPromptTokens = 0;
      state.dailyCompletionTokens = 0;
    }
  } catch {
    state = defaultBudgetState();
  }

  return {
    model,
    sessionPromptTokens: state.sessionPromptTokens,
    sessionCompletionTokens: state.sessionCompletionTokens,
    dailyPromptTokens: state.dailyPromptTokens,
    dailyCompletionTokens: state.dailyCompletionTokens,
    sessionEstimatedCostUsd: estimateTotalCostUsd(model, state.sessionPromptTokens, state.sessionCompletionTokens),
    dailyEstimatedCostUsd: estimateTotalCostUsd(model, state.dailyPromptTokens, state.dailyCompletionTokens),
    sessionTokenBudget: RUNTIME_CONFIG.modelSessionTokenBudget,
    dailyTokenBudget: RUNTIME_CONFIG.modelDailyTokenBudget,
    dayKey: state.dayKey,
  };
}

export function classifyFallbackableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = Number((error as { status?: unknown })?.status ?? 0);
  return (
    status === 429 ||
    status >= 500 ||
    /rate limit/i.test(message) ||
    /timeout/i.test(message) ||
    /unavailable/i.test(message) ||
    /connection/i.test(message)
  );
}

export const MODEL_POLICY = new ModelPolicyManager();
