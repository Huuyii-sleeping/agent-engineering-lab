import type { MemoryType } from "./types.js";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function asMemoryType(raw: unknown): MemoryType {
  const text = String(raw ?? "").trim();
  if (text === "fact" || text === "preference" || text === "constraint" || text === "decision" || text === "summary") {
    return text;
  }
  return "fact";
}

export function asTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .slice(0, 12);
}

export function normalizeConfidence(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return 0.7;
  }
  if (n < 0) {
    return 0;
  }
  if (n > 1) {
    return 1;
  }
  return n;
}

export function normalizeMemoryText(text: string): string {
  return normalizeText(text);
}
