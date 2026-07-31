import { RUNTIME_CONFIG } from "../runtime-config.js";
import { asMemoryType } from "./normalize.js";
import { scoreEntryBreakdown } from "./scorer.js";
import { MemoryStore } from "./store.js";
import type { MemoryEntry, MemoryLayer, SearchHit } from "./types.js";

export function parseLayer(raw: unknown): MemoryLayer {
  const value = String(raw ?? "both");
  if (value === "short_term" || value === "long_term" || value === "durable" || value === "both") {
    return value;
  }
  return "both";
}

export function resolveSearchLimit(limit: unknown): number {
  const parsed = Number(limit);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : RUNTIME_CONFIG.memorySearchDefaultLimit;
}

export function resolveListLimit(limit: unknown): number {
  const parsed = Number(limit);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 50;
}

export async function searchMemoryHits(
  store: MemoryStore,
  query: string,
  limit: number,
  layer: MemoryLayer,
  typeFilterRaw?: unknown,
): Promise<SearchHit[]> {
  const typeFilterText = String(typeFilterRaw ?? "").trim();
  const typeFilter = typeFilterText ? asMemoryType(typeFilterText) : null;

  const hits: SearchHit[] = [];
  if (layer === "short_term" || layer === "both") {
    const items = await store.listLayer("short_term");
    for (const item of items) {
      if (typeFilter && item.type !== typeFilter) {
        continue;
      }
      const scoreBreakdown = scoreEntryBreakdown(query, item);
      hits.push({ ...item, score: scoreBreakdown.total, scoreBreakdown, layer: "short_term" });
    }
  }
  if (layer === "long_term" || layer === "both") {
    const items = await store.listLayer("long_term");
    for (const item of items) {
      if (typeFilter && item.type !== typeFilter) {
        continue;
      }
      const scoreBreakdown = scoreEntryBreakdown(query, item);
      hits.push({ ...item, score: scoreBreakdown.total, scoreBreakdown, layer: "long_term" });
    }
  }
  if (layer === "durable" || layer === "both") {
    const topics = await store.listDurable();
    for (const topic of topics) {
      if (typeFilter && topic.type !== typeFilter) {
        continue;
      }
      const scoreBreakdown = scoreEntryBreakdown(query, topic);
      hits.push({
        ...topic,
        score: scoreBreakdown.total,
        scoreBreakdown,
        layer: "durable",
        scope: topic.scope,
        path: `${topic.indexPath} -> ${topic.path}`,
        checksum: topic.checksum,
        reason: topic.reason ?? "matched query terms from durable project memory",
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

export async function listMemoryEntries(
  store: MemoryStore,
  layer: MemoryLayer,
  limit: number,
): Promise<Array<{ layer: string; entry: MemoryEntry }>> {
  const out: Array<{ layer: string; entry: MemoryEntry }> = [];
  if (layer === "short_term" || layer === "both") {
    const shortItems = await store.listLayer("short_term");
    for (const item of shortItems.slice(-limit)) {
      out.push({ layer: "short_term", entry: item });
    }
  }
  if (layer === "long_term" || layer === "both") {
    const longItems = await store.listLayer("long_term");
    for (const item of longItems.slice(-limit)) {
      out.push({ layer: "long_term", entry: item });
    }
  }
  if (layer === "durable" || layer === "both") {
    const durableItems = await store.listDurable();
    for (const item of durableItems.slice(-limit)) {
      out.push({ layer: "durable", entry: item });
    }
  }
  return out;
}
