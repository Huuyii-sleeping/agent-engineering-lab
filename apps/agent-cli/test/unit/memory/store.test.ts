import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { extractCandidates } from "../../../src/memory/extractor.js";
import {
  runAgentMemorySnapshot,
  runMemoryDoctor,
  runMemoryExplain,
  runMemoryMigrateJsonl,
  runMemoryRebuildIndex,
  runMemorySessionSummarize,
  runTeamMemorySync,
} from "../../../src/memory/service.js";
import { MemoryStore } from "../../../src/memory/store.js";
import { isAgentMemoryPath, resolveAgentMemoryRoot } from "../../../src/memory/files.js";

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

  it("writes durable markdown memory with index and audit events", async () => {
    await withWorkspace();
    const store = new MemoryStore();

    await store.add("user", "constraint", ["style"], "Always answer in concise Chinese.", 0.91);

    const projectDirs = await readdir(path.join(process.cwd(), ".memory", "projects"));
    expect(projectDirs).toHaveLength(1);
    const durableRoot = path.join(process.cwd(), ".memory", "projects", projectDirs[0], "memory");
    const indexRaw = await readFile(path.join(durableRoot, "MEMORY.md"), "utf8");
    const metadataRaw = await readFile(path.join(durableRoot, ".metadata", "index.json"), "utf8");
    const eventsRaw = await readFile(path.join(durableRoot, ".metadata", "events.jsonl"), "utf8");
    const topicFiles = await readdir(path.join(durableRoot, "memories"));

    expect(indexRaw).toContain("Always answer in concise Chinese.");
    expect(JSON.parse(metadataRaw)).toMatchObject({ schemaVersion: 1 });
    expect(eventsRaw).toContain("\"action\":\"upsert\"");
    expect(topicFiles.some((file) => file.endsWith(".md"))).toBe(true);
  });

  it("includes durable memory provenance in explain output", async () => {
    await withWorkspace();
    const store = new MemoryStore();
    await store.add("user", "decision", ["architecture"], "Use file-backed memory topics for durable recall.", 0.88);

    const explained = JSON.parse(await runMemoryExplain("durable recall", 5)) as {
      ok: boolean;
      hits: Array<{ path?: string; reason?: string; scope?: string }>;
      gaps: Array<{ id: string; status: string }>;
    };

    expect(explained.ok).toBe(true);
    expect(explained.hits.some((hit) => hit.scope === "project" && hit.path?.includes("MEMORY.md"))).toBe(true);
    expect(explained.hits.some((hit) => hit.reason?.includes("matched query terms"))).toBe(true);
    expect(explained.gaps).toContainEqual({ id: "team_memory_sync", status: "reserved_gap" });
  });

  it("reports durable memory doctor status and rebuilds index from markdown files", async () => {
    await withWorkspace();
    const store = new MemoryStore();
    await store.add("user", "fact", ["docs"], "Durable memory keeps a human-readable index.", 0.8);

    const rebuild = JSON.parse(await runMemoryRebuildIndex()) as { ok: boolean; rebuiltTopics: number };
    const doctor = JSON.parse(await runMemoryDoctor()) as {
      ok: boolean;
      scopes: Array<{ scope: string; status: string; topicCount: number }>;
      reservedGaps: Array<{ id: string; status: string }>;
    };

    expect(rebuild).toMatchObject({ ok: true, rebuiltTopics: 1 });
    expect(doctor.ok).toBe(true);
    expect(doctor.scopes).toContainEqual(expect.objectContaining({ scope: "project", status: "available", topicCount: 1 }));
    expect(doctor.scopes).toContainEqual(expect.objectContaining({ scope: "agent", status: "available" }));
    expect(doctor.reservedGaps).toContainEqual({ id: "team_memory_sync", status: "reserved_gap" });
  });

  it("extracts Chinese memory candidates without mojibake rules", () => {
    const candidates = extractCandidates("我偏好中文回答。必须先运行测试。我们决定采用文件化记忆。");

    expect(candidates.map((item) => item.type)).toEqual(["preference", "constraint", "decision"]);
  });

  it("guards agent memory paths against cross-scope and traversal writes", async () => {
    await withWorkspace();
    const root = resolveAgentMemoryRoot("reviewer", "project").root;

    expect(isAgentMemoryPath(path.join(root, "MEMORY.md"), "reviewer", "project")).toBe(true);
    expect(isAgentMemoryPath(path.join(root, "..", "other", "MEMORY.md"), "reviewer", "project")).toBe(false);
    expect(isAgentMemoryPath(path.join(process.cwd(), ".agent", "team-memory", "MEMORY.md"), "reviewer", "project")).toBe(false);
  });

  it("initializes agent memory from a snapshot without replacing existing memory", async () => {
    await withWorkspace();
    const snapshotRoot = path.join(process.cwd(), ".agent", "agent-memory-snapshots", "reviewer");
    await mkdir(snapshotRoot, { recursive: true });
    await writeFile(path.join(snapshotRoot, "MEMORY.md"), "# Reviewer Snapshot\n\n- prefer strict reviews\n", "utf8");

    const initialized = JSON.parse(await runAgentMemorySnapshot("reviewer", "project", "initialize")) as {
      ok: boolean;
      status: string;
      initialized: boolean;
      memoryDir: string;
    };
    const second = JSON.parse(await runAgentMemorySnapshot("reviewer", "project", "initialize")) as {
      ok: boolean;
      status: string;
      initialized: boolean;
    };
    const memoryRaw = await readFile(path.join(initialized.memoryDir, "MEMORY.md"), "utf8");

    expect(initialized).toMatchObject({ ok: true, status: "initialize", initialized: true });
    expect(second).toMatchObject({ ok: true, initialized: false });
    expect(memoryRaw).toContain("prefer strict reviews");
  });

  it("dry-runs JSONL migration into durable memory topics", async () => {
    await withWorkspace();
    const store = new MemoryStore();
    await store.add("legacy", "preference", ["style"], "Prefer compact migration summaries.", 0.77);

    const dryRun = JSON.parse(await runMemoryMigrateJsonl("dry-run")) as {
      ok: boolean;
      mode: string;
      candidates: number;
      applied: number;
    };
    const applied = JSON.parse(await runMemoryMigrateJsonl("apply")) as {
      ok: boolean;
      mode: string;
      candidates: number;
      applied: number;
    };

    expect(dryRun).toMatchObject({ ok: true, mode: "dry-run", candidates: 1, applied: 0 });
    expect(applied).toMatchObject({ ok: true, mode: "apply", candidates: 1, applied: 1 });
  });

  it("reports local vector scoring details in memory explain output", async () => {
    await withWorkspace();
    const store = new MemoryStore();
    await store.add("user", "fact", ["retrieval"], "Hashed vector retrieval stays fully local.", 0.8);

    const explained = JSON.parse(await runMemoryExplain("local vector retrieval", 3, "both")) as {
      ok: boolean;
      retrievalMode: string;
      hits: Array<{ scoreBreakdown?: { vector: number } }>;
      gaps: Array<{ id: string; status: string }>;
    };

    expect(explained.ok).toBe(true);
    expect(explained.retrievalMode).toBe("hybrid_keyword_bigram_local_vector");
    expect(explained.hits.some((hit) => typeof hit.scoreBreakdown?.vector === "number")).toBe(true);
    expect(explained.gaps).toContainEqual({ id: "external_embedding_service", status: "reserved_gap" });
  });

  it("syncs local team memory with checksum status", async () => {
    await withWorkspace();

    const pushed = JSON.parse(await runTeamMemorySync("push", "Use the shared release checklist.")) as {
      ok: boolean;
      status: string;
      checksum: string;
      path: string;
    };
    const status = JSON.parse(await runTeamMemorySync("status")) as {
      ok: boolean;
      status: string;
      checksum: string;
    };
    const pulled = JSON.parse(await runTeamMemorySync("pull")) as {
      ok: boolean;
      content: string;
    };

    expect(pushed).toMatchObject({ ok: true, status: "clean" });
    expect(status.checksum).toBe(pushed.checksum);
    expect(pulled.content).toContain("Use the shared release checklist.");
  });

  it("redacts secret-like content in local team memory", async () => {
    await withWorkspace();

    const pushed = JSON.parse(await runTeamMemorySync("push", "token=sk-12345678901234567890")) as {
      ok: boolean;
      path: string;
    };
    const raw = await readFile(path.join(process.cwd(), pushed.path), "utf8");

    expect(pushed.ok).toBe(true);
    expect(raw).toContain("[REDACTED_SECRET]");
    expect(raw).not.toContain("sk-12345678901234567890");
  });

  it("writes explicit session summaries through memory service", async () => {
    await withWorkspace();

    const result = JSON.parse(await runMemorySessionSummarize("s456", "Session summary from background worker.")) as {
      ok: boolean;
      path: string;
    };
    const raw = await readFile(path.join(process.cwd(), result.path), "utf8");

    expect(result.path).toBe(".sessions/s456/session-memory.md");
    expect(raw).toContain("Session summary from background worker.");
  });

  it("redacts secret-like content in explicit session summaries", async () => {
    await withWorkspace();

    const result = JSON.parse(await runMemorySessionSummarize("s789", "token=sk-12345678901234567890")) as {
      ok: boolean;
      path: string;
    };
    const raw = await readFile(path.join(process.cwd(), result.path), "utf8");

    expect(result.ok).toBe(true);
    expect(raw).toContain("[REDACTED_SECRET]");
    expect(raw).not.toContain("sk-12345678901234567890");
  });
});
