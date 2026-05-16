import { mkdtemp, readFile, rm } from "node:fs/promises";
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
});
