import type { MemoryEntry, MemoryScoreBreakdown } from "./types.js";
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

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashedVector(text: string, dimensions = 32): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of tokenize(text)) {
    const hash = hashToken(token);
    const index = hash % dimensions;
    const sign = hash & 1 ? 1 : -1;
    vector[index] += sign;
  }
  return vector;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (aNorm <= 0 || bNorm <= 0) {
    return 0;
  }
  return Math.max(0, dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm)));
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}

export function scoreEntryBreakdown(query: string, entry: MemoryEntry): MemoryScoreBreakdown {
  const text = `${entry.type} ${entry.tags.join(" ")} ${entry.content}`;
  const keyword = overlapScore(query, text);
  const bigram = jaccard(charBigrams(query), charBigrams(text));
  const vector = cosineSimilarity(hashedVector(query), hashedVector(text));
  const recency = 1;
  const confidence = entry.confidence;
  const total = 0.4 * keyword + 0.2 * bigram + 0.2 * vector + 0.15 * confidence + 0.05 * recency;
  return {
    keyword: roundScore(keyword),
    bigram: roundScore(bigram),
    vector: roundScore(vector),
    confidence: roundScore(confidence),
    recency: roundScore(recency),
    total: roundScore(total),
  };
}

export function scoreEntry(query: string, entry: MemoryEntry): number {
  return scoreEntryBreakdown(query, entry).total;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
