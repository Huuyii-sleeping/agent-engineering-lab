import * as process from "node:process";

type RuntimeConfig = {
  bashTimeoutMs: number;
  bashMaxOutputChars: number;
  fileReadDefaultLimit: number;
  compactThresholdTokens: number;
  compactDefaultKeepRecent: number;
  recoveryContinuationMaxAttempts: number;
  recoveryCompactMaxAttempts: number;
  recoveryTransportMaxAttempts: number;
  recoveryBackoffBaseMs: number;
  recoveryBackoffMaxMs: number;
  schedulerPollIntervalMs: number;
  backgroundMaxOutputChars: number;
  autonomyPollIntervalMs: number;
  autonomyIdleTimeoutMs: number;
  subagentDefaultWaitTimeoutMs: number;
  subagentMaxRounds: number;
  subagentMaxTokens: number;
  securityApprovalDefaultTtlSec: number;
  sessionRetentionDays: number;
  transcriptRetentionDays: number;
  promptDumpRetentionDays: number;
  memoryShortTermLimit: number;
  memoryShortTermRetentionDays: number;
  memoryLongTermRetentionDays: number;
  memorySearchDefaultLimit: number;
  memoryInjectTopK: number;
  memoryInjectMaxTokens: number;
  observabilityFieldMaxChars: number;
  hookTimeoutMs: number;
  mcpStartupTimeoutMs: number;
  mcpRequestTimeoutMs: number;
  mcpToolRetryMaxAttempts: number;
  deliveryStageTimeoutMs: number;
  deliveryRetryMaxAttempts: number;
  deliveryAutoRunEnabled: boolean;
  modelSessionTokenBudget: number;
  modelDailyTokenBudget: number;
};

function readInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export const RUNTIME_CONFIG: RuntimeConfig = {
  bashTimeoutMs: readInt("AGENT_BASH_TIMEOUT_MS", 120_000, 1),
  bashMaxOutputChars: readInt("AGENT_BASH_MAX_OUTPUT_CHARS", 50_000, 100),
  fileReadDefaultLimit: readInt("AGENT_FILE_READ_DEFAULT_LIMIT", 50_000, 100),
  compactThresholdTokens: readInt("AGENT_COMPACT_THRESHOLD_TOKENS", 50_000, 100),
  compactDefaultKeepRecent: readInt("AGENT_COMPACT_DEFAULT_KEEP_RECENT", 20, 1),
  recoveryContinuationMaxAttempts: readInt("AGENT_RECOVERY_CONTINUATION_MAX_ATTEMPTS", 2, 0),
  recoveryCompactMaxAttempts: readInt("AGENT_RECOVERY_COMPACT_MAX_ATTEMPTS", 2, 0),
  recoveryTransportMaxAttempts: readInt("AGENT_RECOVERY_TRANSPORT_MAX_ATTEMPTS", 3, 0),
  recoveryBackoffBaseMs: readInt("AGENT_RECOVERY_BACKOFF_BASE_MS", 1_000, 1),
  recoveryBackoffMaxMs: readInt("AGENT_RECOVERY_BACKOFF_MAX_MS", 8_000, 1),
  schedulerPollIntervalMs: readInt("AGENT_SCHEDULER_POLL_INTERVAL_MS", 1_000, 100),
  backgroundMaxOutputChars: readInt("AGENT_BACKGROUND_MAX_OUTPUT_CHARS", 4_000, 100),
  autonomyPollIntervalMs: readInt("AGENT_AUTONOMY_POLL_INTERVAL_MS", 5_000, 100),
  autonomyIdleTimeoutMs: readInt("AGENT_AUTONOMY_IDLE_TIMEOUT_MS", 60_000, 1_000),
  subagentDefaultWaitTimeoutMs: readInt("AGENT_SUBAGENT_WAIT_TIMEOUT_MS", 30_000, 1_000),
  subagentMaxRounds: readInt("AGENT_SUBAGENT_MAX_ROUNDS", 12, 1),
  subagentMaxTokens: readInt("AGENT_SUBAGENT_MAX_TOKENS", 2_000, 100),
  securityApprovalDefaultTtlSec: readInt("AGENT_SECURITY_APPROVAL_DEFAULT_TTL_SEC", 600, 30),
  sessionRetentionDays: readInt("AGENT_SESSION_RETENTION_DAYS", 14, 1),
  transcriptRetentionDays: readInt("AGENT_TRANSCRIPT_RETENTION_DAYS", 7, 1),
  promptDumpRetentionDays: readInt("AGENT_PROMPT_DUMP_RETENTION_DAYS", 7, 1),
  memoryShortTermLimit: readInt("AGENT_MEMORY_SHORT_TERM_LIMIT", 40, 1),
  memoryShortTermRetentionDays: readInt("AGENT_MEMORY_SHORT_TERM_RETENTION_DAYS", 14, 1),
  memoryLongTermRetentionDays: readInt("AGENT_MEMORY_LONG_TERM_RETENTION_DAYS", 90, 1),
  memorySearchDefaultLimit: readInt("AGENT_MEMORY_SEARCH_DEFAULT_LIMIT", 8, 1),
  memoryInjectTopK: readInt("AGENT_MEMORY_INJECT_TOP_K", 5, 1),
  memoryInjectMaxTokens: readInt("AGENT_MEMORY_INJECT_MAX_TOKENS", 700, 100),
  observabilityFieldMaxChars: readInt("AGENT_OBSERVABILITY_FIELD_MAX_CHARS", 400, 40),
  hookTimeoutMs: readInt("AGENT_HOOK_TIMEOUT_MS", 10_000, 100),
  mcpStartupTimeoutMs: readInt("AGENT_MCP_STARTUP_TIMEOUT_MS", 10_000, 100),
  mcpRequestTimeoutMs: readInt("AGENT_MCP_REQUEST_TIMEOUT_MS", 10_000, 100),
  mcpToolRetryMaxAttempts: readInt("AGENT_MCP_TOOL_RETRY_MAX_ATTEMPTS", 1, 0),
  deliveryStageTimeoutMs: readInt("AGENT_DELIVERY_STAGE_TIMEOUT_MS", 180_000, 1_000),
  deliveryRetryMaxAttempts: readInt("AGENT_DELIVERY_RETRY_MAX_ATTEMPTS", 1, 0),
  deliveryAutoRunEnabled: readBool("AGENT_DELIVERY_AUTO_RUN_ENABLED", true),
  modelSessionTokenBudget: readInt("AGENT_MODEL_SESSION_TOKEN_BUDGET", 200_000, 1_000),
  modelDailyTokenBudget: readInt("AGENT_MODEL_DAILY_TOKEN_BUDGET", 2_000_000, 1_000),
};
