import * as process from "node:process";

type RuntimeConfig = {
  bashTimeoutMs: number;
  bashMaxOutputChars: number;
  bashSandboxMode: BashSandboxMode;
  fileReadDefaultLimit: number;
  compactThresholdTokens: number;
  compactDefaultKeepRecent: number;
  compactMinReductionTokens: number;
  modelContextWindowTokens: number;
  modelContextReserveTokens: number;
  modelMaxCompletionTokens: number;
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

export type BashSandboxMode = "off" | "workspace-write" | "strict-readonly";
export type PrivacyPersistenceMode = "default" | "disabled";
export type PrivacyMemoryMode = "default" | "manual_only" | "disabled";
export type PrivacyObservabilityMode = "default" | "minimal" | "disabled";
export type PrivacyRemoteAttachMode = "default" | "local_only";
export type PrivacyExternalCapabilitiesMode = "default" | "disabled" | "allowlist";

export type PrivacyConfig = {
  persistenceMode: PrivacyPersistenceMode;
  memoryMode: PrivacyMemoryMode;
  observabilityMode: PrivacyObservabilityMode;
  remoteAttachMode: PrivacyRemoteAttachMode;
  externalCapabilitiesMode: PrivacyExternalCapabilitiesMode;
  mcpAllowlist: string[];
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

function readEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  return allowed.find((value) => value === normalized) ?? fallback;
}

function readCsvList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return [...new Set(raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export function getBashSandboxMode(env: Partial<NodeJS.ProcessEnv> = process.env): BashSandboxMode {
  return readEnum(env.AGENT_BASH_SANDBOX_MODE, ["off", "workspace-write", "strict-readonly"], "workspace-write");
}

export const RUNTIME_CONFIG: RuntimeConfig = {
  bashTimeoutMs: readInt("AGENT_BASH_TIMEOUT_MS", 120_000, 1),
  bashMaxOutputChars: readInt("AGENT_BASH_MAX_OUTPUT_CHARS", 50_000, 100),
  bashSandboxMode: getBashSandboxMode(),
  fileReadDefaultLimit: readInt("AGENT_FILE_READ_DEFAULT_LIMIT", 50_000, 100),
  compactThresholdTokens: readInt("AGENT_COMPACT_THRESHOLD_TOKENS", 50_000, 100),
  compactDefaultKeepRecent: readInt("AGENT_COMPACT_DEFAULT_KEEP_RECENT", 20, 1),
  compactMinReductionTokens: readInt("AGENT_COMPACT_MIN_REDUCTION_TOKENS", 100, 0),
  modelContextWindowTokens: readInt("AGENT_MODEL_CONTEXT_WINDOW_TOKENS", 200_000, 1_000),
  modelContextReserveTokens: readInt("AGENT_MODEL_CONTEXT_RESERVE_TOKENS", 16_000, 0),
  modelMaxCompletionTokens: readInt("AGENT_MODEL_MAX_COMPLETION_TOKENS", 8_000, 1),
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

export function getPrivacyConfig(env: NodeJS.ProcessEnv = process.env): PrivacyConfig {
  return {
    persistenceMode: readEnum(env.AGENT_PRIVACY_PERSISTENCE_MODE, ["default", "disabled"], "default"),
    memoryMode: readEnum(env.AGENT_PRIVACY_MEMORY_MODE, ["default", "manual_only", "disabled"], "default"),
    observabilityMode: readEnum(
      env.AGENT_PRIVACY_OBSERVABILITY_MODE,
      ["default", "minimal", "disabled"],
      "default",
    ),
    remoteAttachMode: readEnum(env.AGENT_PRIVACY_REMOTE_ATTACH_MODE, ["default", "local_only"], "default"),
    externalCapabilitiesMode: readEnum(
      env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE,
      ["default", "disabled", "allowlist"],
      "default",
    ),
    mcpAllowlist: readCsvList(env.AGENT_PRIVACY_MCP_ALLOWLIST),
  };
}

export function isLocalPersistenceEnabled(config = getPrivacyConfig()): boolean {
  return config.persistenceMode !== "disabled";
}

export function isMemoryAutomationEnabled(config = getPrivacyConfig()): boolean {
  return config.memoryMode === "default";
}

export function isRemoteAttachAllowed(config = getPrivacyConfig()): boolean {
  return config.remoteAttachMode !== "local_only";
}

export function shouldPersistObservabilityEvent(
  kind: string,
  config = getPrivacyConfig(),
): boolean {
  if (config.observabilityMode === "disabled") {
    return false;
  }
  if (config.observabilityMode === "default") {
    return true;
  }
  return kind === "security_blocked" || kind.startsWith("replay") || kind.includes("error");
}
