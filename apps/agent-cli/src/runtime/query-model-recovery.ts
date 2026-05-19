import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentRuntimeState } from "./query-types.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import type { ObservabilityServiceLike } from "../services/index.js";
import {
  createInitialRecoveryState,
  formatRecoveryFailure,
  makePromptTooLongSignal,
  selectRecoveryDecision,
  type RecoveryDecision,
  type RecoveryState,
} from "../recovery.js";
import { compactMessages, isCompactReductionEffective } from "../tools/context-compact.js";

export async function appendQueryModelRecoveryFailure(input: {
  messages: ChatCompletionMessageParam[];
  observabilityService: ObservabilityServiceLike;
  traceId: string;
  phase: "model_request" | "model_response";
  decision: { reason: string; detail: string };
}): Promise<void> {
  const failure = formatRecoveryFailure({
    action: "fail",
    reason: input.decision.reason,
    detail: input.decision.detail,
    nextState: createInitialRecoveryState(),
  });
  await input.observabilityService.recordEvent("error", { phase: input.phase, message: failure }, { traceId: input.traceId });
  input.messages.push({ role: "assistant", content: failure });
}

export async function recordQueryModelRecoveryDecision(input: {
  observabilityService: ObservabilityServiceLike;
  traceId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await input.observabilityService.recordEvent("recovery_decision", input.payload, { traceId: input.traceId });
}

export async function applyQueryModelPreflightRecovery(input: {
  messages: ChatCompletionMessageParam[];
  estimatedPromptTokens: number;
  thresholdTokens: number;
  recoveryState: RecoveryState;
  round: number;
  runtimeState: AgentRuntimeState;
  observabilityService: ObservabilityServiceLike;
  traceId: string;
}): Promise<{ ok: true; recoveryState: RecoveryState } | { ok: false; recoveryState: RecoveryState }> {
  const decision = selectRecoveryDecision(
    makePromptTooLongSignal(
      `estimated prompt tokens ${input.estimatedPromptTokens} exceeded threshold ${input.thresholdTokens}`,
      "preflight_estimate",
    ),
    input.recoveryState,
  );
  const recoveryState = decision.nextState;
  await recordQueryModelRecoveryDecision({
    observabilityService: input.observabilityService,
    traceId: input.traceId,
    payload: {
      round: input.round,
      action: decision.action,
      reason: decision.reason,
      detail: decision.detail,
      state: recoveryState,
      estimatedPromptTokens: input.estimatedPromptTokens,
    },
  });
  if (decision.action !== "compact") {
    await appendQueryModelRecoveryFailure({
      messages: input.messages,
      observabilityService: input.observabilityService,
      traceId: input.traceId,
      phase: "model_request",
      decision,
    });
    return { ok: false, recoveryState };
  }
  const compactResult = await compactQueryModelMessages(input.messages, "auto compact", input.runtimeState);
  if (!isCompactReductionEffective(compactResult)) {
    await appendQueryModelRecoveryFailure({
      messages: input.messages,
      observabilityService: input.observabilityService,
      traceId: input.traceId,
      phase: "model_request",
      decision: {
        reason: "compact_ineffective",
        detail: `auto compact reduced ${compactResult.reducedBy} token(s), below minimum ${compactResult.minReductionTokens}`,
      },
    });
    return { ok: false, recoveryState };
  }
  return { ok: true, recoveryState };
}

export async function compactQueryModelMessages(
  messages: ChatCompletionMessageParam[],
  label: string,
  runtimeState?: AgentRuntimeState,
): Promise<Awaited<ReturnType<typeof compactMessages>> & { minReductionTokens: number }> {
  const compactResult = await compactMessages(
    {
      messages,
      sessionId: runtimeState?.sessionId,
      state: runtimeState
        ? {
            sessionId: runtimeState.sessionId,
            activeTaskId: runtimeState.activeTaskId === null ? null : String(runtimeState.activeTaskId),
            roundCounter: runtimeState.roundCounter,
            touchedPaths: [...runtimeState.touchedPaths].sort(),
            wroteWorkspaceFiles: runtimeState.wroteWorkspaceFiles,
          }
        : undefined,
    },
    "auto",
  );
  console.log(
    `\u001b[36m[${label}]\u001b[0m before=${compactResult.estimatedBefore} after=${compactResult.estimatedAfter} snapshot=${compactResult.transcriptPath}`,
  );
  return {
    ...compactResult,
    minReductionTokens: RUNTIME_CONFIG.compactMinReductionTokens,
  };
}

export function logQueryModelContinuation(recoveryState: RecoveryState): void {
  console.log(`\u001b[36m[recovery continue]\u001b[0m attempts=${recoveryState.continuationAttempts}`);
}

export function logQueryModelBackoff(decision: Extract<RecoveryDecision, { action: "backoff" }>, recoveryState: RecoveryState): void {
  console.log(
    `\u001b[36m[recovery backoff]\u001b[0m delay=${decision.delayMs}ms attempts=${recoveryState.transportAttempts}`,
  );
}
