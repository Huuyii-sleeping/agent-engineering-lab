import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { isLocalPersistenceEnabled, RUNTIME_CONFIG } from "../runtime-config.js";
import { sanitizeAndRedactText } from "../security/data-hygiene.js";
import { extractCandidates } from "./extractor.js";
import {
  initializeAgentMemoryFromSnapshot,
  inspectAgentMemorySnapshot,
} from "./files.js";
import { buildMemoryInjectionFromHits } from "./injection.js";
import { listMemoryEntries, parseLayer, resolveListLimit, resolveSearchLimit, searchMemoryHits } from "./retrieval.js";
import { fail, ok } from "./response.js";
import { MemoryStore } from "./store.js";
import type { AgentMemoryScope, SearchHit } from "./types.js";

const MEMORY = new MemoryStore();

const RESERVED_MEMORY_GAPS = [
  { id: "team_memory_sync", status: "reserved_gap" },
  { id: "session_memory_background_summary", status: "reserved_gap" },
  { id: "external_embedding_service", status: "reserved_gap" },
];

function checksum(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "default";
}

function teamMemoryPath(): { relativePath: string; fullPath: string } {
  const relativePath = path.join(".agent", "team-memory", "MEMORY.md");
  return {
    relativePath: relativePath.replace(/\\/g, "/"),
    fullPath: path.join(process.cwd(), relativePath),
  };
}

export async function runMemoryAdd(
  source: unknown,
  type: unknown,
  tags: unknown,
  content: unknown,
  confidence: unknown,
): Promise<string> {
  const entry = await MEMORY.add(source, type, tags, content, confidence);
  if (!entry) {
    return fail("INVALID_ARGUMENT", "memory_add requires content");
  }
  return ok({ entry });
}

export async function runMemorySearch(query: unknown, limit?: unknown, layer?: unknown, type?: unknown): Promise<string> {
  const text = String(query ?? "").trim();
  if (!text) {
    return fail("INVALID_ARGUMENT", "memory_search requires query");
  }
  const selectedLayer = parseLayer(layer);
  const max = resolveSearchLimit(limit);
  const hits = await searchMemoryHits(MEMORY, text, max, selectedLayer, type);
  return ok({ query: text, hits });
}

export async function runMemoryList(layer?: unknown, limit?: unknown): Promise<string> {
  const selectedLayer = parseLayer(layer);
  const max = resolveListLimit(limit);
  const out = await listMemoryEntries(MEMORY, selectedLayer, max);
  return ok({ memories: out });
}

export async function runMemoryExplain(query: unknown, limit?: unknown, layer?: unknown, type?: unknown): Promise<string> {
  const text = String(query ?? "").trim();
  if (!text) {
    return fail("INVALID_ARGUMENT", "memory_explain requires query");
  }
  const selectedLayer = parseLayer(layer);
  const max = resolveSearchLimit(limit);
  const hits = await searchMemoryHits(MEMORY, text, max, selectedLayer, type);
  return ok({
    query: text,
    retrievalMode: "hybrid_keyword_bigram_local_vector",
    hits: hits.map((hit) => ({
      id: hit.id,
      layer: hit.layer,
      scope: hit.scope ?? (hit.layer === "durable" ? "project" : undefined),
      type: hit.type,
      score: hit.score,
      source: hit.source,
      path: hit.path,
      checksum: hit.checksum,
      reason: hit.reason ?? "matched query terms in JSONL memory",
      scoreBreakdown: hit.scoreBreakdown,
      tokenCost: Math.ceil(hit.content.length / 4),
      content: hit.content,
    })),
    gaps: RESERVED_MEMORY_GAPS,
  });
}

export async function runMemoryRebuildIndex(): Promise<string> {
  const result = await MEMORY.rebuildDurableIndex();
  return ok({ rebuiltTopics: result.rebuiltTopics });
}

export async function runMemoryDoctor(): Promise<string> {
  const durable = await MEMORY.durableDoctor();
  const team = await inspectTeamMemory();
  return ok({
    scopes: [
      {
        scope: durable.scope,
        class: "auto_memory",
        status: durable.status,
        root: durable.root,
        topicCount: durable.topicCount,
        indexPath: durable.indexPath,
        eventsPath: durable.eventsPath,
      },
      {
        scope: "session",
        class: "session_memory",
        status: "available",
        topicCount: 0,
        note: "compact writes and reuses .sessions/<sessionId>/session-memory.md; background summarizer remains reserved",
      },
      {
        scope: "agent",
        class: "agent_memory",
        status: "available",
        topicCount: 0,
        note: "project/user/local path guards and snapshot initialization are available",
      },
      {
        scope: "team",
        class: "team_memory",
        status: team.exists ? "available" : "empty",
        topicCount: team.exists ? 1 : 0,
        path: team.path,
        checksum: team.checksum,
        note: "local file sync is available; managed remote team memory remains a reserved gap",
      },
    ],
    reservedGaps: RESERVED_MEMORY_GAPS,
  });
}

async function inspectTeamMemory(): Promise<{ exists: boolean; path: string; checksum: string | null; content: string }> {
  const paths = teamMemoryPath();
  const content = await readFile(paths.fullPath, "utf8").catch(() => "");
  return {
    exists: content.trim().length > 0,
    path: paths.relativePath,
    checksum: content ? checksum(content) : null,
    content,
  };
}

export async function runTeamMemorySync(actionArg?: unknown, contentArg?: unknown): Promise<string> {
  const action = String(actionArg ?? "status").trim();
  const paths = teamMemoryPath();
  if (!isLocalPersistenceEnabled()) {
    return fail("LOCAL_PERSISTENCE_DISABLED", "team_memory_sync requires local persistence");
  }
  if (action === "status") {
    const status = await inspectTeamMemory();
    return ok({
      status: status.exists ? "clean" : "missing",
      path: status.path,
      checksum: status.checksum,
      mode: "local_file",
      remote: "reserved_gap",
    });
  }
  if (action === "pull") {
    const status = await inspectTeamMemory();
    return ok({
      status: status.exists ? "clean" : "missing",
      path: status.path,
      checksum: status.checksum,
      content: status.content,
      mode: "local_file",
      remote: "reserved_gap",
    });
  }
  if (action === "push") {
    const content = sanitizeAndRedactText(String(contentArg ?? "").trim());
    if (!content) {
      return fail("INVALID_ARGUMENT", "team_memory_sync push requires content");
    }
    await mkdir(path.dirname(paths.fullPath), { recursive: true });
    const body = content.endsWith("\n") ? content : `${content}\n`;
    await writeFile(paths.fullPath, body, "utf8");
    return ok({
      status: "clean",
      path: paths.relativePath,
      checksum: checksum(body),
      mode: "local_file",
      remote: "reserved_gap",
    });
  }
  return fail("INVALID_ARGUMENT", "action must be status, pull, or push");
}

export async function runMemorySessionSummarize(sessionIdArg: unknown, summaryArg: unknown): Promise<string> {
  const sessionId = String(sessionIdArg ?? "").trim();
  const summary = sanitizeAndRedactText(String(summaryArg ?? "").trim());
  if (!sessionId) {
    return fail("INVALID_ARGUMENT", "memory_session_summarize requires session_id");
  }
  if (!summary) {
    return fail("INVALID_ARGUMENT", "memory_session_summarize requires summary");
  }
  if (!isLocalPersistenceEnabled()) {
    return fail("LOCAL_PERSISTENCE_DISABLED", "memory_session_summarize requires local persistence");
  }
  const relativePath = path.join(".sessions", safeSessionId(sessionId), "session-memory.md");
  const fullPath = path.join(process.cwd(), relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  const body = [
    "# Session memory summary",
    "",
    `updatedAt: ${new Date().toISOString()}`,
    "source: memory_session_summarize",
    "",
    summary,
    "",
  ].join("\n");
  await writeFile(fullPath, body, "utf8");
  return ok({
    path: relativePath.replace(/\\/g, "/"),
    checksum: checksum(body),
  });
}

function parseAgentMemoryScope(scope: unknown): AgentMemoryScope {
  const value = String(scope ?? "project").trim();
  return value === "user" || value === "local" || value === "project" ? value : "project";
}

export async function runAgentMemorySnapshot(
  agentType: unknown,
  scopeArg?: unknown,
  actionArg?: unknown,
): Promise<string> {
  const agent = String(agentType ?? "").trim();
  if (!agent) {
    return fail("INVALID_ARGUMENT", "agent_memory_snapshot requires agent_type");
  }
  const scope = parseAgentMemoryScope(scopeArg);
  const action = String(actionArg ?? "status").trim();
  if (action === "status") {
    const status = await inspectAgentMemorySnapshot(agent, scope);
    return ok({ ...status, initialized: false });
  }
  if (action === "initialize") {
    const result = await initializeAgentMemoryFromSnapshot(agent, scope);
    return ok(result);
  }
  if (action === "mark_synced") {
    const status = await inspectAgentMemorySnapshot(agent, scope);
    return ok({ ...status, marked: false, reason: "mark_synced is reserved for managed snapshot updates" });
  }
  return fail("INVALID_ARGUMENT", "action must be status, initialize, or mark_synced");
}

export async function runMemoryMigrateJsonl(modeArg?: unknown): Promise<string> {
  const modeText = String(modeArg ?? "dry-run").trim();
  const mode = modeText === "apply" ? "apply" : "dry-run";
  const candidates = await MEMORY.listLayer("long_term");
  if (mode === "dry-run") {
    return ok({ mode, candidates: candidates.length, applied: 0 });
  }
  for (const entry of candidates) {
    await MEMORY.upsertDurable(entry);
  }
  return ok({ mode, candidates: candidates.length, applied: candidates.length });
}

export async function autoExtractMemory(source: string, text: string): Promise<void> {
  const candidates = extractCandidates(text);
  for (const item of candidates) {
    await MEMORY.add(source, item.type, item.tags, item.content, item.confidence);
  }
}

export async function buildMemoryInjectionForQuery(
  query: string,
): Promise<{ content: string | null; usedEntries: number; estimatedTokens: number }> {
  const text = query.trim();
  if (!text) {
    return { content: null, usedEntries: 0, estimatedTokens: 0 };
  }
  const hits: SearchHit[] = await searchMemoryHits(MEMORY, text, RUNTIME_CONFIG.memoryInjectTopK, "both");
  return buildMemoryInjectionFromHits(hits);
}
