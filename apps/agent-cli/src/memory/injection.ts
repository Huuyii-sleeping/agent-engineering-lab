import { RUNTIME_CONFIG } from "../runtime-config.js";
import { estimateTokens } from "./scorer.js";
import type { SearchHit } from "./types.js";

export function buildMemoryInjectionFromHits(hits: SearchHit[]): {
  content: string | null;
  usedEntries: number;
  estimatedTokens: number;
} {
  if (hits.length === 0) {
    return { content: null, usedEntries: 0, estimatedTokens: 0 };
  }

  const lines: string[] = [];
  let tokens = 0;
  let count = 0;

  for (const hit of hits.slice(0, RUNTIME_CONFIG.memoryInjectTopK)) {
    const line = `- (${hit.layer}) [${hit.type}] score=${hit.score} source=${hit.source}: ${hit.content}`;
    const next = estimateTokens(`${lines.join("\n")}\n${line}`);
    if (next > RUNTIME_CONFIG.memoryInjectMaxTokens) {
      break;
    }
    lines.push(line);
    tokens = next;
    count += 1;
  }

  if (count === 0) {
    return { content: null, usedEntries: 0, estimatedTokens: 0 };
  }

  return {
    content: `<memory_context>\n${lines.join("\n")}\n</memory_context>`,
    usedEntries: count,
    estimatedTokens: tokens,
  };
}
