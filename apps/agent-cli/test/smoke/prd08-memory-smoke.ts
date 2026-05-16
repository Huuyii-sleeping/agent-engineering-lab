import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { buildMemoryInjectionForQuery, runMemoryAdd, runMemorySearch } from "../../src/tools/memory.js";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function asJson(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

async function cleanMemory(): Promise<void> {
  await rm(path.join(process.cwd(), ".memory"), { recursive: true, force: true }).catch(() => {});
}

async function main(): Promise<void> {
  await cleanMemory();

  const secret = "token=sk-12345678901234567890";
  const content = `Remember to include specific change details. ${secret}`;
  const added = asJson(await runMemoryAdd("user", "constraint", ["lang", "rule"], content, 0.95));
  assert(added.ok === true, "memory_add should succeed");
  assert(JSON.stringify(added).includes("[REDACTED_SECRET]"), "memory_add response should redact secret-like content");

  const search = asJson(await runMemorySearch("specific change details", 5, "both"));
  assert(search.ok === true, "memory_search should succeed");
  const hits = search.hits as Array<{ score?: number; source?: string; content?: string }> | undefined;
  if (!Array.isArray(hits) || hits.length === 0) {
    throw new Error("memory_search should return hits");
  }
  const firstHit = hits[0];
  assert(typeof firstHit.score === "number", "memory_search hit should include score");
  assert(typeof firstHit.source === "string", "memory_search hit should include source");
  assert(typeof firstHit.content === "string" && firstHit.content.includes("[REDACTED_SECRET]"), "search should return redacted content");

  const inject = await buildMemoryInjectionForQuery("include the change details in the next answer");
  assert(inject.usedEntries > 0, "memory injection should include at least one entry");
  assert(inject.estimatedTokens > 0, "memory injection should have token estimate");
  assert(typeof inject.content === "string" && inject.content.includes("[REDACTED_SECRET]"), "memory injection should stay redacted");

  const longPath = path.join(process.cwd(), ".memory", "long_term.jsonl");
  const raw = await readFile(longPath, "utf8");
  assert(raw.includes("[REDACTED_SECRET]"), "long_term memory should persist redacted content");
  assert(!raw.includes(secret), "long_term memory should not persist raw secret");

  console.log("PRD08_MEMORY_SMOKE_OK");
}

main().catch((error) => {
  console.error("PRD08_MEMORY_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
