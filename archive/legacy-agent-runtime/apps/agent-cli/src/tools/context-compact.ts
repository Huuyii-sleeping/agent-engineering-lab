import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { RUNTIME_CONFIG, isLocalPersistenceEnabled } from "../runtime-config.js";
import { sanitizeAndRedactValue } from "../security/data-hygiene.js";
import { buildArtifactMetadata, isExpired } from "../security/local-retention.js";

export const COMPACT_THRESHOLD_TOKENS = RUNTIME_CONFIG.compactThresholdTokens;
const SUMMARY_LINE_LIMIT = 24;
const SUMMARY_ITEM_CHAR_LIMIT = 160;
const STATE_PATH_LIMIT = 12;

export type CompactRuntimeState = {
  sessionId?: string | null;
  activeTaskId?: string | null;
  roundCounter?: number | null;
  touchedPaths?: string[];
  wroteWorkspaceFiles?: boolean;
};

export type CompactRuntimeContext = {
  sessionId?: string | null;
  messages: ChatCompletionMessageParam[];
  state?: CompactRuntimeState;
};

const COMPACT_RUNTIME_CONTEXT = new AsyncLocalStorage<CompactRuntimeContext>();

type CompactResult = {
  estimatedBefore: number;
  estimatedAfter: number;
  reducedBy: number;
  transcriptPath: string;
  transcriptBeforePath: string;
  transcriptAfterPath: string;
  sessionMemoryPath: string | null;
  keptRecent: number;
  oldMessageCount: number;
  newMessageCount: number;
  reason: "manual" | "auto";
};

function asStringContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return JSON.stringify(content);
  }
  return "";
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}...`;
}

export function estimateTokensFromMessages(messages: ChatCompletionMessageParam[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += asStringContent((message as { content?: unknown }).content).length;
    chars += JSON.stringify(message).length;
  }
  return Math.ceil(chars / 4);
}

async function writeTranscriptSnapshot(
  messages: ChatCompletionMessageParam[],
  phase: "before" | "after",
  stamp: number,
): Promise<string> {
  if (!isLocalPersistenceEnabled()) {
    return `[disabled by privacy mode: transcript ${phase} persistence skipped]`;
  }
  const dir = path.join(process.cwd(), ".transcripts");
  await mkdir(dir, { recursive: true });
  await cleanupTranscriptSnapshots(dir);
  const filename = `transcript_${phase}_${stamp}.jsonl`;
  const full = path.join(dir, filename);
  const metaPath = path.join(dir, `transcript_${phase}_${stamp}.meta.json`);
  const lines = messages.map((message) => JSON.stringify(sanitizeAndRedactValue(message)));
  await writeFile(full, `${lines.join("\n")}\n`, "utf8");
  await writeFile(
    metaPath,
    `${JSON.stringify(
      {
        ...buildArtifactMetadata("transcript_snapshot"),
        phase,
        transcriptPath: filename,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return path.relative(process.cwd(), full).replace(/\\/g, "/");
}

export function getEffectiveCompactThresholdTokens(): number {
  const reservedWindow = Math.max(
    100,
    RUNTIME_CONFIG.modelContextWindowTokens - RUNTIME_CONFIG.modelContextReserveTokens,
  );
  return Math.min(RUNTIME_CONFIG.compactThresholdTokens, reservedWindow);
}

export function isCompactReductionEffective(result: Pick<CompactResult, "estimatedBefore" | "estimatedAfter" | "reducedBy">): boolean {
  if (result.estimatedAfter >= result.estimatedBefore) {
    return false;
  }
  return result.reducedBy >= RUNTIME_CONFIG.compactMinReductionTokens;
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "default";
}

async function cleanupTranscriptSnapshots(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".meta.json")) {
      continue;
    }
    const metaPath = path.join(dir, entry.name);
    const raw = await readFile(metaPath, "utf8").catch(() => "");
    if (!raw.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as { expiresAt?: unknown; transcriptPath?: unknown };
      if (!isExpired(typeof parsed.expiresAt === "number" ? parsed.expiresAt : null)) {
        continue;
      }
      const transcriptName = String(parsed.transcriptPath ?? "").trim();
      if (transcriptName) {
        await rm(path.join(dir, transcriptName), { force: true }).catch(() => {});
      }
      await rm(metaPath, { force: true }).catch(() => {});
    } catch {
      // ignore malformed metadata
    }
  }
}

function describeToolCalls(message: ChatCompletionMessageParam): string[] {
  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return [];
  }
  const names = toolCalls
    .map((toolCall) => {
      if (!toolCall || typeof toolCall !== "object") {
        return "unknown";
      }
      const fn = (toolCall as { function?: { name?: unknown } }).function;
      return typeof fn?.name === "string" && fn.name.trim() ? fn.name.trim() : "unknown";
    })
    .slice(0, 6);
  const suffix = toolCalls.length > names.length ? ` +${toolCalls.length - names.length}` : "";
  return [`tool_calls=${names.join(",")}${suffix}`];
}

function describeMessageContent(message: ChatCompletionMessageParam): string[] {
  const parts: string[] = [];
  const role = (message as { role?: string }).role ?? "unknown";
  const content = (message as { content?: unknown }).content;
  const text = asStringContent(content).replace(/\s+/g, " ").trim();
  if (text) {
    parts.push(`text="${truncate(text, SUMMARY_ITEM_CHAR_LIMIT)}"`);
  }
  if (Array.isArray(content)) {
    parts.push(`content_parts=${content.length}`);
  }
  const toolName = (message as { name?: string }).name;
  if (role === "tool" || toolName) {
    parts.push(`tool_result=${toolName ?? "unknown"}`);
  }
  parts.push(...describeToolCalls(message));
  return parts.length > 0 ? parts : ["non_text_message=true"];
}

function summarizeMessages(messages: ChatCompletionMessageParam[]): string {
  const lines: string[] = [];
  for (const message of messages.slice(0, SUMMARY_LINE_LIMIT)) {
    const role = (message as { role?: string }).role ?? "unknown";
    lines.push(`- [${role}] ${describeMessageContent(message).join("; ")}`);
  }
  if (messages.length > SUMMARY_LINE_LIMIT) {
    lines.push(`- ... and ${messages.length - SUMMARY_LINE_LIMIT} more messages`);
  }
  return lines.join("\n");
}

function formatRuntimeState(context: CompactRuntimeContext): string {
  const state = context.state;
  const lines: string[] = [];
  const sessionId = state?.sessionId ?? context.sessionId;
  if (sessionId) {
    lines.push(`- sessionId: ${sessionId}`);
  }
  if (state?.activeTaskId) {
    lines.push(`- activeTaskId: ${state.activeTaskId}`);
  }
  if (typeof state?.roundCounter === "number") {
    lines.push(`- roundCounter: ${state.roundCounter}`);
  }
  if (typeof state?.wroteWorkspaceFiles === "boolean") {
    lines.push(`- wroteWorkspaceFiles: ${state.wroteWorkspaceFiles}`);
  }
  if (state?.touchedPaths?.length) {
    const paths = state.touchedPaths.slice(0, STATE_PATH_LIMIT);
    const suffix = state.touchedPaths.length > paths.length ? `, +${state.touchedPaths.length - paths.length} more` : "";
    lines.push(`- touchedPaths: ${paths.join(", ")}${suffix}`);
  }
  return lines.join("\n");
}

async function readSessionMemory(sessionId?: string | null): Promise<{ path: string; content: string } | null> {
  const id = String(sessionId ?? "").trim();
  if (!id || !isLocalPersistenceEnabled()) {
    return null;
  }
  const relativePath = path.join(".sessions", safeSessionId(id), "session-memory.md");
  const full = path.join(process.cwd(), relativePath);
  const content = await readFile(full, "utf8").catch(() => "");
  return content.trim() ? { path: relativePath.replace(/\\/g, "/"), content } : null;
}

async function writeSessionMemory(
  sessionId: string | null | undefined,
  older: ChatCompletionMessageParam[],
  summary: string,
): Promise<string | null> {
  const id = String(sessionId ?? "").trim();
  if (!id || !isLocalPersistenceEnabled() || older.length === 0) {
    return null;
  }
  const dir = path.join(process.cwd(), ".sessions", safeSessionId(id));
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, "session-memory.md");
  const content = [
    "# Session memory summary",
    "",
    `updatedAt: ${new Date().toISOString()}`,
    `messageCount: ${older.length}`,
    "",
    summary || "- (no older text content)",
    "",
  ].join("\n");
  await writeFile(full, content, "utf8");
  return path.relative(process.cwd(), full).replace(/\\/g, "/");
}

export async function compactMessages(
  context: CompactRuntimeContext,
  reason: "manual" | "auto",
  keepRecentArg?: unknown,
): Promise<CompactResult> {
  const keepRecentParsed = Number(keepRecentArg);
  const keepRecent =
    Number.isInteger(keepRecentParsed) && keepRecentParsed > 0
      ? keepRecentParsed
      : RUNTIME_CONFIG.compactDefaultKeepRecent;

  const stamp = Date.now();
  const oldMessages = [...context.messages];
  const estimatedBefore = estimateTokensFromMessages(oldMessages);
  const transcriptBeforePath = await writeTranscriptSnapshot(oldMessages, "before", stamp);

  const splitAt = Math.max(0, oldMessages.length - keepRecent);
  const older = oldMessages.slice(0, splitAt);
  const recent = oldMessages.slice(splitAt);
  const summary = summarizeMessages(older);
  const previousSessionMemory = await readSessionMemory(context.sessionId);
  const sessionMemoryPath = await writeSessionMemory(context.sessionId, older, summary);
  const sessionMemoryPrefix = previousSessionMemory
    ? `Session memory summary reused from ${previousSessionMemory.path}:\n${previousSessionMemory.content}\n\n`
    : "";
  const runtimeState = formatRuntimeState(context);
  const compactedMessage: ChatCompletionMessageParam = {
    role: "assistant",
    content: [
      `Context compacted (${reason}).`,
      `Compaction stats: summarizedMessages=${older.length}; keptRecentMessages=${recent.length}; estimatedBefore=${estimatedBefore}.`,
      sessionMemoryPrefix.trim() ? sessionMemoryPrefix.trim() : null,
      runtimeState ? `Runtime state restored after compaction:\n${runtimeState}` : null,
      `Dehydrated summary of earlier messages:\n${summary || "- (no older text content)"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };

  const newMessages = older.length > 0 ? [compactedMessage, ...recent] : recent;
  context.messages.splice(0, context.messages.length, ...newMessages);
  const transcriptAfterPath = await writeTranscriptSnapshot(context.messages, "after", stamp);

  const estimatedAfter = estimateTokensFromMessages(context.messages);
  return {
    estimatedBefore,
    estimatedAfter,
    reducedBy: Math.max(0, estimatedBefore - estimatedAfter),
    transcriptPath: transcriptBeforePath,
    transcriptBeforePath,
    transcriptAfterPath,
    sessionMemoryPath,
    keptRecent: keepRecent,
    oldMessageCount: oldMessages.length,
    newMessageCount: context.messages.length,
    reason,
  };
}

function toCompactError(message: string): string {
  return JSON.stringify({ ok: false, error: { code: "COMPACT_ERROR", message } }, null, 2);
}

export const CONTEXT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "estimate_tokens",
      description: "Estimate current conversation tokens using chars/4 approximation.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "compact",
      description:
        "Compact current conversation context and persist a pre-compact transcript snapshot.",
      parameters: {
        type: "object",
        properties: {
          keep_recent: { type: "integer" },
        },
      },
    },
  },
];

export async function runEstimateTokens(context?: CompactRuntimeContext): Promise<string> {
  if (!context) {
    return toCompactError("missing runtime context");
  }
  const estimatedTokens = estimateTokensFromMessages(context.messages);
  return JSON.stringify({ ok: true, estimatedTokens }, null, 2);
}

export async function runCompact(
  keepRecentArg: unknown,
  context?: CompactRuntimeContext,
): Promise<string> {
  if (!context) {
    return toCompactError("missing runtime context");
  }
  try {
    const result = await compactMessages(context, "manual", keepRecentArg);
    return JSON.stringify({ ok: true, ...result }, null, 2);
  } catch (error) {
    return toCompactError(error instanceof Error ? error.message : String(error));
  }
}

export function getCompactRuntimeContext(): CompactRuntimeContext | undefined {
  return COMPACT_RUNTIME_CONTEXT.getStore();
}

export async function withCompactRuntimeContext<T>(
  context: CompactRuntimeContext,
  fn: () => Promise<T>,
): Promise<T> {
  return COMPACT_RUNTIME_CONTEXT.run(context, fn);
}
