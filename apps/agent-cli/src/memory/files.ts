import { createHash } from "node:crypto";
import { appendFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { buildArtifactMetadata, isExpired } from "../security/local-retention.js";
import { nowTimestampMs, parseTimestampMs } from "../time.js";
import type { AgentMemoryScope, DurableMemoryIndex, DurableMemoryTopic, MemoryEntry } from "./types.js";

const INDEX_LIMIT_LINES = 200;

function checksum(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function sanitizeSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/^[a-zA-Z]:/, "")
    .replace(/\\/g, "/")
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/[\/]+/g, "_")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 80) || "workspace";
}

function sanitizeAgentType(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "default"
  );
}

function safeSummary(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function topicFilename(entry: MemoryEntry): string {
  return `${entry.id}.md`;
}

function metadataLine(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return `${key}: ${value.join(",")}`;
  }
  return `${key}: ${value ?? ""}`;
}

function parseMetadata(raw: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!match) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const splitAt = line.indexOf(":");
    if (splitAt <= 0) {
      continue;
    }
    out[line.slice(0, splitAt).trim()] = line.slice(splitAt + 1).trim();
  }
  return out;
}

function parseBody(raw: string): string {
  const stripped = raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
  return stripped.replace(/^# .+\n+/, "").trim();
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rm(filePath, { force: true }).catch(() => {});
  await rename(tmp, filePath);
}

export function resolveProjectMemoryRoot(cwd = process.cwd()): {
  projectKey: string;
  root: string;
  memoriesDir: string;
  metadataDir: string;
  indexPath: string;
  metadataPath: string;
  eventsPath: string;
} {
  const projectKey = sanitizeSegment(cwd);
  const root = path.join(cwd, ".memory", "projects", projectKey, "memory");
  const memoriesDir = path.join(root, "memories");
  const metadataDir = path.join(root, ".metadata");
  return {
    projectKey,
    root,
    memoriesDir,
    metadataDir,
    indexPath: path.join(root, "MEMORY.md"),
    metadataPath: path.join(metadataDir, "index.json"),
    eventsPath: path.join(metadataDir, "events.jsonl"),
  };
}

export function resolveAgentMemoryRoot(
  agentType: string,
  scope: AgentMemoryScope = "project",
  cwd = process.cwd(),
): { agentType: string; scope: AgentMemoryScope; root: string; syncedPath: string } {
  const safeAgent = sanitizeAgentType(agentType);
  const root =
    scope === "user"
      ? path.join(cwd, ".memory", "agent-memory", safeAgent)
      : scope === "local"
        ? path.join(cwd, ".agent", "agent-memory-local", safeAgent)
        : path.join(cwd, ".agent", "agent-memory", safeAgent);
  return {
    agentType: safeAgent,
    scope,
    root,
    syncedPath: path.join(root, ".snapshot-synced.json"),
  };
}

export function resolveAgentMemorySnapshotRoot(agentType: string, cwd = process.cwd()): { agentType: string; root: string } {
  const safeAgent = sanitizeAgentType(agentType);
  return {
    agentType: safeAgent,
    root: path.join(cwd, ".agent", "agent-memory-snapshots", safeAgent),
  };
}

export function isAgentMemoryPath(
  targetPath: string,
  agentType: string,
  scope: AgentMemoryScope = "project",
  cwd = process.cwd(),
): boolean {
  const root = path.resolve(resolveAgentMemoryRoot(agentType, scope, cwd).root);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

async function hasFiles(dir: string): Promise<boolean> {
  const entries = await readdir(dir).catch(() => []);
  return entries.length > 0;
}

async function directoryExists(dir: string): Promise<boolean> {
  return stat(dir)
    .then((info) => info.isDirectory())
    .catch(() => false);
}

export async function inspectAgentMemorySnapshot(
  agentType: string,
  scope: AgentMemoryScope = "project",
  cwd = process.cwd(),
): Promise<{
  agentType: string;
  scope: AgentMemoryScope;
  status: "none" | "initialize" | "prompt-update";
  memoryDir: string;
  snapshotDir: string;
}> {
  const memory = resolveAgentMemoryRoot(agentType, scope, cwd);
  const snapshot = resolveAgentMemorySnapshotRoot(agentType, cwd);
  const snapshotAvailable = await directoryExists(snapshot.root);
  if (!snapshotAvailable) {
    return { agentType: memory.agentType, scope, status: "none", memoryDir: memory.root, snapshotDir: snapshot.root };
  }
  const memoryHasFiles = await hasFiles(memory.root);
  if (!memoryHasFiles) {
    return { agentType: memory.agentType, scope, status: "initialize", memoryDir: memory.root, snapshotDir: snapshot.root };
  }
  const syncedRaw = await readFile(memory.syncedPath, "utf8").catch(() => "");
  if (!syncedRaw.trim()) {
    return { agentType: memory.agentType, scope, status: "prompt-update", memoryDir: memory.root, snapshotDir: snapshot.root };
  }
  return { agentType: memory.agentType, scope, status: "none", memoryDir: memory.root, snapshotDir: snapshot.root };
}

export async function initializeAgentMemoryFromSnapshot(
  agentType: string,
  scope: AgentMemoryScope = "project",
  cwd = process.cwd(),
): Promise<{
  agentType: string;
  scope: AgentMemoryScope;
  status: "none" | "initialize" | "prompt-update";
  initialized: boolean;
  memoryDir: string;
  snapshotDir: string;
}> {
  const status = await inspectAgentMemorySnapshot(agentType, scope, cwd);
  if (status.status !== "initialize") {
    return { ...status, initialized: false };
  }
  await mkdir(status.memoryDir, { recursive: true });
  await cp(status.snapshotDir, status.memoryDir, { recursive: true, force: false, errorOnExist: false });
  const synced = {
    schemaVersion: 1,
    agentType: status.agentType,
    scope,
    snapshotDir: status.snapshotDir,
    syncedAt: nowTimestampMs(),
  };
  await writeFile(path.join(status.memoryDir, ".snapshot-synced.json"), `${JSON.stringify(synced, null, 2)}\n`, "utf8");
  return { ...status, initialized: true };
}

export class DurableMemoryStore {
  private readonly pendingWrites = new Map<string, Promise<void>>();

  constructor(private readonly cwd?: string) {}

  private paths() {
    return resolveProjectMemoryRoot(this.cwd ?? process.cwd());
  }

  private async ensureInit(): Promise<void> {
    const paths = this.paths();
    await mkdir(paths.memoriesDir, { recursive: true });
    await mkdir(paths.metadataDir, { recursive: true });
    await readFile(paths.indexPath, "utf8").catch(() =>
      writeFile(paths.indexPath, "# Memory Index\n\n_No durable memories yet._\n", "utf8"),
    );
    await readFile(paths.metadataPath, "utf8").catch(() =>
      writeFile(
        paths.metadataPath,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            generatedAt: nowTimestampMs(),
            scope: "project",
            root: paths.root,
            topics: [],
          } satisfies DurableMemoryIndex,
          null,
          2,
        )}\n`,
        "utf8",
      ),
    );
    await readFile(paths.eventsPath, "utf8").catch(() => writeFile(paths.eventsPath, "", "utf8"));
  }

  private async enqueue(key: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.pendingWrites.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.pendingWrites.set(key, next);
    try {
      await next;
    } finally {
      if (this.pendingWrites.get(key) === next) {
        this.pendingWrites.delete(key);
      }
    }
  }

  private toTopic(entry: MemoryEntry, rawContent: string): DurableMemoryTopic {
    const paths = this.paths();
    const relativePath = `memories/${topicFilename(entry)}`;
    return {
      ...entry,
      scope: "project",
      path: relativePath,
      indexPath: "MEMORY.md",
      checksum: checksum(rawContent),
      expiresAt: entry.expiresAt ?? buildArtifactMetadata("memory_long_term", entry.updatedAt).expiresAt,
      reason: "matched query terms from durable project memory",
    };
  }

  private topicMarkdown(entry: MemoryEntry): string {
    const body = entry.content.trim();
    const meta = [
      "---",
      metadataLine("id", entry.id),
      metadataLine("scope", "project"),
      metadataLine("source", entry.source),
      metadataLine("type", entry.type),
      metadataLine("tags", entry.tags),
      metadataLine("confidence", entry.confidence),
      metadataLine("updatedAt", entry.updatedAt),
      metadataLine("expiresAt", entry.expiresAt ?? buildArtifactMetadata("memory_long_term", entry.updatedAt).expiresAt),
      "---",
    ].join("\n");
    return `${meta}\n# ${safeSummary(body)}\n\n${body}\n`;
  }

  private async writeIndex(topics: DurableMemoryTopic[]): Promise<void> {
    const paths = this.paths();
    const active = topics.filter((topic) => !isExpired(topic.expiresAt));
    const lines = [
      "# Memory Index",
      "",
      "| Topic | Type | Tags | Updated | Status |",
      "| --- | --- | --- | --- | --- |",
      ...active.slice(0, INDEX_LIMIT_LINES - 4).map((topic) => {
        const summary = safeSummary(topic.content).replace(/\|/g, "\\|");
        return `| [${summary}](${topic.path}) | ${topic.type} | ${topic.tags.join(", ")} | ${new Date(topic.updatedAt).toISOString()} | active |`;
      }),
      "",
    ];
    const index: DurableMemoryIndex = {
      schemaVersion: 1,
      generatedAt: nowTimestampMs(),
      scope: "project",
      root: paths.root,
      topics: active,
    };
    await atomicWrite(paths.indexPath, lines.join("\n"));
    await atomicWrite(paths.metadataPath, `${JSON.stringify(index, null, 2)}\n`);
  }

  private async appendEvent(action: string, topic: DurableMemoryTopic | null, extra: Record<string, unknown> = {}): Promise<void> {
    const paths = this.paths();
    await appendFile(
      paths.eventsPath,
      `${JSON.stringify({
        schemaVersion: 1,
        action,
        scope: "project",
        id: topic?.id ?? null,
        path: topic?.path ?? null,
        createdAt: nowTimestampMs(),
        ...extra,
      })}\n`,
      "utf8",
    );
  }

  async listTopics(): Promise<DurableMemoryTopic[]> {
    await this.ensureInit();
    const paths = this.paths();
    const raw = await readFile(paths.metadataPath, "utf8").catch(() => "");
    try {
      const parsed = JSON.parse(raw) as Partial<DurableMemoryIndex>;
      return (Array.isArray(parsed.topics) ? parsed.topics : [])
        .map((topic) => ({
          ...topic,
          scope: "project" as const,
          source: String(topic.source ?? "unknown"),
          type: topic.type ?? "fact",
          tags: Array.isArray(topic.tags) ? topic.tags.map(String) : [],
          content: String(topic.content ?? ""),
          confidence: typeof topic.confidence === "number" ? topic.confidence : 0.5,
          updatedAt: parseTimestampMs(topic.updatedAt, nowTimestampMs()),
          expiresAt: topic.expiresAt === null || topic.expiresAt === undefined ? null : parseTimestampMs(topic.expiresAt, nowTimestampMs()),
          path: String(topic.path ?? ""),
          indexPath: String(topic.indexPath ?? "MEMORY.md"),
          checksum: String(topic.checksum ?? ""),
          reason: String(topic.reason ?? "matched query terms from durable project memory"),
        }))
        .filter((topic) => topic.id && topic.content && !isExpired(topic.expiresAt));
    } catch {
      return this.rebuildIndex().then((result) => result.topics);
    }
  }

  async upsert(entry: MemoryEntry): Promise<DurableMemoryTopic> {
    await this.ensureInit();
    const paths = this.paths();
    const markdown = this.topicMarkdown(entry);
    const topic = this.toTopic(entry, markdown);
    await this.enqueue(topic.id, async () => {
      await atomicWrite(path.join(paths.memoriesDir, topicFilename(entry)), markdown);
      const topics = (await this.listTopics()).filter((item) => item.id !== topic.id);
      await this.writeIndex([...topics, topic]);
      await this.appendEvent("upsert", topic);
    });
    return topic;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInit();
    const paths = this.paths();
    const topics = await this.listTopics();
    const found = topics.find((topic) => topic.id === id);
    if (!found) {
      return false;
    }
    await this.enqueue(id, async () => {
      await rm(path.join(paths.root, found.path), { force: true }).catch(() => {});
      await this.writeIndex(topics.filter((topic) => topic.id !== id));
      await this.appendEvent("delete", found);
    });
    return true;
  }

  async rebuildIndex(): Promise<{ rebuiltTopics: number; topics: DurableMemoryTopic[] }> {
    await this.ensureInit();
    const paths = this.paths();
    const files = (await readdir(paths.memoriesDir).catch(() => [])).filter((file) => file.endsWith(".md"));
    const topics: DurableMemoryTopic[] = [];
    for (const file of files) {
      const raw = await readFile(path.join(paths.memoriesDir, file), "utf8").catch(() => "");
      if (!raw.trim()) {
        continue;
      }
      const meta = parseMetadata(raw);
      const content = parseBody(raw);
      const entry: MemoryEntry = {
        id: meta.id || file.replace(/\.md$/, ""),
        source: meta.source || "unknown",
        type:
          meta.type === "preference" || meta.type === "constraint" || meta.type === "decision" || meta.type === "summary"
            ? meta.type
            : "fact",
        tags: meta.tags ? meta.tags.split(",").map((item) => item.trim()).filter(Boolean) : [],
        content,
        confidence: Number.isFinite(Number(meta.confidence)) ? Number(meta.confidence) : 0.5,
        updatedAt: parseTimestampMs(meta.updatedAt, nowTimestampMs()),
        expiresAt: meta.expiresAt ? parseTimestampMs(meta.expiresAt, nowTimestampMs()) : null,
      };
      topics.push(this.toTopic(entry, raw));
    }
    await this.writeIndex(topics);
    await this.appendEvent("rebuild_index", null, { rebuiltTopics: topics.length });
    return { rebuiltTopics: topics.length, topics };
  }

  async doctor(): Promise<{
    root: string;
    scope: "project";
    status: "available" | "empty";
    topicCount: number;
    indexPath: string;
    eventsPath: string;
  }> {
    const paths = this.paths();
    const raw = await readFile(paths.metadataPath, "utf8").catch(() => "");
    let topicCount = 0;
    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as Partial<DurableMemoryIndex>;
        topicCount = Array.isArray(parsed.topics)
          ? parsed.topics.filter((topic) => !isExpired(topic.expiresAt ?? null)).length
          : 0;
      } catch {
        topicCount = 0;
      }
    }
    return {
      root: paths.root,
      scope: "project",
      status: topicCount > 0 ? "available" : "empty",
      topicCount,
      indexPath: paths.indexPath,
      eventsPath: paths.eventsPath,
    };
  }
}
