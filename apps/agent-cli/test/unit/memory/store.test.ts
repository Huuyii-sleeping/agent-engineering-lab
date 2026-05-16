import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../../../src/memory/store.js";

let tempDir = "";
let previousCwd = "";

afterEach(async () => {
  if (previousCwd) {
    process.chdir(previousCwd);
    previousCwd = "";
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function withWorkspace(): Promise<void> {
  tempDir = await mkdtemp(path.join(tmpdir(), "memory-store-test-"));
  previousCwd = process.cwd();
  process.chdir(tempDir);
}

describe("memory/store", () => {
  it("redacts secret-like content before persistence", async () => {
    await withWorkspace();
    const store = new MemoryStore();

    const entry = await store.add("user", "note", ["secret"], "token=sk-12345678901234567890", 0.9);
    const raw = await readFile(path.join(process.cwd(), ".memory", "long_term.jsonl"), "utf8");

    expect(entry?.content).toContain("[REDACTED_SECRET]");
    expect(raw).toContain("[REDACTED_SECRET]");
    expect(raw).not.toContain("sk-12345678901234567890");
  });

  it("prunes expired memory entries when loading a layer", async () => {
    await withWorkspace();
    const store = new MemoryStore();
    await store.listLayer("long_term");
    const root = path.join(process.cwd(), ".memory");
    await writeFile(
      path.join(root, "long_term.jsonl"),
      `${JSON.stringify({
        id: "expired",
        source: "test",
        type: "fact",
        tags: [],
        content: "old",
        confidence: 0.5,
        updatedAt: 1,
        expiresAt: 2,
      })}\n`,
      "utf8",
    );

    const entries = await store.listLayer("long_term");

    expect(entries).toEqual([]);
  });

  it("supports explicit deletion of memory entries", async () => {
    await withWorkspace();
    const store = new MemoryStore();
    const entry = await store.add("user", "note", ["cleanup"], "temporary note", 0.8);

    const removed = await store.delete(entry?.id ?? "");
    const entries = await store.listLayer("long_term");

    expect(removed).toBe(true);
    expect(entries.some((item) => item.id === entry?.id)).toBe(false);
  });
});
