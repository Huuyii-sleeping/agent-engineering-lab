import { RUNTIME_CONFIG } from "./runtime-config.js";

export type RecoveryState = {
  continuationAttempts: number;
  compactAttempts: number;
  transportAttempts: number;
};

export type RecoverySignal =
  | {
      kind: "output_truncated";
      finishReason: string;
    }
  | {
      kind: "prompt_too_long";
      reason: "preflight_estimate" | "api_context_limit";
      detail: string;
    }
  | {
      kind: "transport_error";
      reason: "timeout" | "rate_limit" | "unavailable" | "connection" | "server_error";
      detail: string;
    }
  | {
      kind: "fail";
      reason: string;
      detail: string;
    };

export type RecoveryConfig = {
  continuationMaxAttempts: number;
  compactMaxAttempts: number;
  transportMaxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
};

export type RecoveryDecision =
  | {
      action: "continue";
      reason: "output_truncated";
      detail: string;
      prompt: string;
      nextState: RecoveryState;
    }
  | {
      action: "compact";
      reason: "prompt_too_long";
      detail: string;
      nextState: RecoveryState;
    }
  | {
      action: "backoff";
      reason: "timeout" | "rate_limit" | "unavailable" | "connection" | "server_error";
      detail: string;
      delayMs: number;
      nextState: RecoveryState;
    }
  | {
      action: "fail";
      reason: string;
      detail: string;
      nextState: RecoveryState;
    };

export const CONTINUATION_PROMPT =
  "Continue exactly from where you stopped. Do not repeat prior text. Do not restart the answer.";

export function createInitialRecoveryState(): RecoveryState {
  return {
    continuationAttempts: 0,
    compactAttempts: 0,
    transportAttempts: 0,
  };
}

export function getRecoveryConfig(): RecoveryConfig {
  return {
    continuationMaxAttempts: RUNTIME_CONFIG.recoveryContinuationMaxAttempts,
    compactMaxAttempts: RUNTIME_CONFIG.recoveryCompactMaxAttempts,
    transportMaxAttempts: RUNTIME_CONFIG.recoveryTransportMaxAttempts,
    backoffBaseMs: RUNTIME_CONFIG.recoveryBackoffBaseMs,
    backoffMaxMs: RUNTIME_CONFIG.recoveryBackoffMaxMs,
  };
}

function cloneState(state: RecoveryState): RecoveryState {
  return {
    continuationAttempts: state.continuationAttempts,
    compactAttempts: state.compactAttempts,
    transportAttempts: state.transportAttempts,
  };
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function flattenError(error: unknown): { code: string | null; type: string | null; message: string; status: number | null } {
  const fallbackMessage = describeUnknownError(error);
  if (!error || typeof error !== "object") {
    return { code: null, type: null, message: fallbackMessage, status: null };
  }

  const record = error as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : null;
  const code = getString(record.code) ?? getString(nested?.code) ?? null;
  const type = getString(record.type) ?? getString(nested?.type) ?? null;
  const status = getNumber(record.status) ?? getNumber(nested?.status) ?? null;
  const message = getString(record.message) ?? getString(nested?.message) ?? fallbackMessage;
  return { code, type, message, status };
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function classifyErrorForRecovery(error: unknown): RecoverySignal {
  const details = flattenError(error);
  const haystack = [details.code, details.type, details.message].filter(Boolean).join(" ").toLowerCase();
  const contextPatterns = [
    /context length/i,
    /context[_ -]?length[_ -]?exceeded/i,
    /maximum context/i,
    /prompt is too long/i,
    /too many tokens/i,
    /max(imum)? tokens/i,
  ];
  if (matchesAny(haystack, contextPatterns)) {
    return {
      kind: "prompt_too_long",
      reason: "api_context_limit",
      detail: details.message,
    };
  }

  const timeoutPatterns = [/timeout/i, /timed out/i, /etimedout/i];
  if (details.status === 408 || matchesAny(haystack, timeoutPatterns)) {
    return {
      kind: "transport_error",
      reason: "timeout",
      detail: details.message,
    };
  }

  const rateLimitPatterns = [/rate limit/i, /rate[_ -]?limit/i, /too many requests/i];
  if (details.status === 429 || matchesAny(haystack, rateLimitPatterns)) {
    return {
      kind: "transport_error",
      reason: "rate_limit",
      detail: details.message,
    };
  }

  const unavailablePatterns = [/service unavailable/i, /temporarily unavailable/i, /overloaded/i, /busy/i];
  if (details.status === 503 || matchesAny(haystack, unavailablePatterns)) {
    return {
      kind: "transport_error",
      reason: "unavailable",
      detail: details.message,
    };
  }

  const connectionPatterns = [/connection/i, /network/i, /socket/i, /econnreset/i, /enotfound/i, /eai_again/i];
  if (matchesAny(haystack, connectionPatterns)) {
    return {
      kind: "transport_error",
      reason: "connection",
      detail: details.message,
    };
  }

  if (details.status !== null && details.status >= 500) {
    return {
      kind: "transport_error",
      reason: "server_error",
      detail: details.message,
    };
  }

  return {
    kind: "fail",
    reason: details.code ?? details.type ?? "unrecoverable_error",
    detail: details.message,
  };
}

export function classifyResponseForRecovery(input: {
  finishReason: string | null | undefined;
  toolCallCount: number;
  content: string;
}): RecoverySignal | null {
  const finishReason = input.finishReason ?? "";
  if (finishReason !== "length" && finishReason !== "max_tokens") {
    return null;
  }
  if (input.toolCallCount > 0) {
    return {
      kind: "fail",
      reason: "truncated_tool_calls",
      detail: "model output truncated while emitting tool calls",
    };
  }
  if (!input.content.trim()) {
    return {
      kind: "fail",
      reason: "empty_truncated_output",
      detail: "model output truncated without recoverable text content",
    };
  }
  return {
    kind: "output_truncated",
    finishReason,
  };
}

export function makePromptTooLongSignal(detail: string, reason: "preflight_estimate" | "api_context_limit"): RecoverySignal {
  return {
    kind: "prompt_too_long",
    reason,
    detail,
  };
}

export function selectRecoveryDecision(
  signal: RecoverySignal,
  state: RecoveryState,
  config: RecoveryConfig = getRecoveryConfig(),
): RecoveryDecision {
  if (signal.kind === "output_truncated") {
    if (state.continuationAttempts >= config.continuationMaxAttempts) {
      return {
        action: "fail",
        reason: "continuation_budget_exhausted",
        detail: `continuation budget exhausted after ${state.continuationAttempts} attempt(s)`,
        nextState: cloneState(state),
      };
    }
    return {
      action: "continue",
      reason: "output_truncated",
      detail: `continuing after ${signal.finishReason} truncation`,
      prompt: CONTINUATION_PROMPT,
      nextState: {
        ...cloneState(state),
        continuationAttempts: state.continuationAttempts + 1,
      },
    };
  }

  if (signal.kind === "prompt_too_long") {
    if (state.compactAttempts >= config.compactMaxAttempts) {
      return {
        action: "fail",
        reason: "compact_budget_exhausted",
        detail: `compact budget exhausted after ${state.compactAttempts} attempt(s): ${signal.detail}`,
        nextState: cloneState(state),
      };
    }
    return {
      action: "compact",
      reason: "prompt_too_long",
      detail: signal.detail,
      nextState: {
        ...cloneState(state),
        compactAttempts: state.compactAttempts + 1,
      },
    };
  }

  if (signal.kind === "transport_error") {
    if (state.transportAttempts >= config.transportMaxAttempts) {
      return {
        action: "fail",
        reason: "transport_budget_exhausted",
        detail: `transport retry budget exhausted after ${state.transportAttempts} attempt(s): ${signal.detail}`,
        nextState: cloneState(state),
      };
    }
    const nextAttempt = state.transportAttempts + 1;
    const delayMs = Math.min(config.backoffBaseMs * 2 ** (nextAttempt - 1), config.backoffMaxMs);
    return {
      action: "backoff",
      reason: signal.reason,
      detail: signal.detail,
      delayMs,
      nextState: {
        ...cloneState(state),
        transportAttempts: nextAttempt,
      },
    };
  }

  return {
    action: "fail",
    reason: signal.reason,
    detail: signal.detail,
    nextState: cloneState(state),
  };
}

export function formatRecoveryFailure(decision: RecoveryDecision): string {
  return `Model request failed: ${decision.reason}. ${decision.detail}`;
}
