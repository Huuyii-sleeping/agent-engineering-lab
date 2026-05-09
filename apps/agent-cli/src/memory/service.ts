import { RUNTIME_CONFIG } from "../runtime-config.js";
import { extractCandidates } from "./extractor.js";
import { buildMemoryInjectionFromHits } from "./injection.js";
import { listMemoryEntries, parseLayer, resolveListLimit, resolveSearchLimit, searchMemoryHits } from "./retrieval.js";
import { fail, ok } from "./response.js";
import { MemoryStore } from "./store.js";
import type { SearchHit } from "./types.js";

const MEMORY = new MemoryStore();

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
