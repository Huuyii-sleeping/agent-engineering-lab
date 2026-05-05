import * as process from "node:process";

type RuntimeConfig = {
  bashTimeoutMs: number;
  bashMaxOutputChars: number;
  fileReadDefaultLimit: number;
  compactThresholdTokens: number;
  compactDefaultKeepRecent: number;
  backgroundMaxOutputChars: number;
  autonomyPollIntervalMs: number;
  autonomyIdleTimeoutMs: number;
  subagentDefaultWaitTimeoutMs: number;
  subagentMaxRounds: number;
  subagentMaxTokens: number;
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

export const RUNTIME_CONFIG: RuntimeConfig = {
  bashTimeoutMs: readInt("AGENT_BASH_TIMEOUT_MS", 120_000, 1),
  bashMaxOutputChars: readInt("AGENT_BASH_MAX_OUTPUT_CHARS", 50_000, 100),
  fileReadDefaultLimit: readInt("AGENT_FILE_READ_DEFAULT_LIMIT", 50_000, 100),
  compactThresholdTokens: readInt("AGENT_COMPACT_THRESHOLD_TOKENS", 50_000, 100),
  compactDefaultKeepRecent: readInt("AGENT_COMPACT_DEFAULT_KEEP_RECENT", 20, 1),
  backgroundMaxOutputChars: readInt("AGENT_BACKGROUND_MAX_OUTPUT_CHARS", 4_000, 100),
  autonomyPollIntervalMs: readInt("AGENT_AUTONOMY_POLL_INTERVAL_MS", 5_000, 100),
  autonomyIdleTimeoutMs: readInt("AGENT_AUTONOMY_IDLE_TIMEOUT_MS", 60_000, 1_000),
  subagentDefaultWaitTimeoutMs: readInt("AGENT_SUBAGENT_WAIT_TIMEOUT_MS", 30_000, 1_000),
  subagentMaxRounds: readInt("AGENT_SUBAGENT_MAX_ROUNDS", 12, 1),
  subagentMaxTokens: readInt("AGENT_SUBAGENT_MAX_TOKENS", 2_000, 100),
};

