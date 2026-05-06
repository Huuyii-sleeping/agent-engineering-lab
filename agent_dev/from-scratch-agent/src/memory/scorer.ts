import type { MemoryEntry } from "./types.js";
import { normalizeMemoryText } from "./normalize.js";

function tokenize(text: string): string[] {
  const tokens = normalizeMemoryText(text).match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (tokens.length > 0) {
    return tokens;
  }
  return normalizeMemoryText(text)
    .split("")
    .filter((item) => item.trim().length > 0);
}

function charBigrams(text: string): Set<string> {
  const norm = normalizeMemoryText(text).replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 1 < norm.length; i += 1) {
    out.add(norm.slice(i, i + 2));
  }
  return out;
}

function overlapScore(query: string, text: string): number {
  const q = tokenize(query);
  const t = new Set(tokenize(text));
  if (q.length === 0 || t.size === 0) {
    return 0;
  }
  let hit = 0;
  for (const token of q) {
    if (t.has(token)) {
      hit += 1;
    }
  }
  return hit / q.length;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) {
      inter += 1;
    }
  }
  const union = a.size + b.size - inter;
  return union <= 0 ? 0 : inter / union;
}

export function scoreEntry(query: string, entry: MemoryEntry): number {
  const text = `${entry.type} ${entry.tags.join(" ")} ${entry.content}`;
  const key = overlapScore(query, text);
  const sim = jaccard(charBigrams(query), charBigrams(text));
  const recency = 1;
  const confidence = entry.confidence;
  return Number((0.45 * key + 0.25 * sim + 0.2 * confidence + 0.1 * recency).toFixed(4));
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
