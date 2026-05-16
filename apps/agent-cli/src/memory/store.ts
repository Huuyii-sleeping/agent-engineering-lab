import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { sanitizeAndRedactText } from "../security/data-hygiene.js";
import { buildArtifactMetadata, isExpired } from "../security/local-retention.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { nowTimestampMs, parseTimestampMs } from "../time.js";
import { parseJsonl, toJsonl } from "./jsonl.js";
import { asMemoryType, asTags, normalizeConfidence, normalizeMemoryText } from "./normalize.js";
import type { MemoryEntry } from "./types.js";

function makeId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function dedupLongTerm(items: MemoryEntry[], next: MemoryEntry): MemoryEntry[] {
  const norm = normalizeMemoryText(next.content);
  const found = items.find((row) => normalizeMemoryText(row.content) === norm && row.type === next.type);
  if (!found) {
    return [...items, next];
  }
  found.updatedAt = next.updatedAt;
  found.confidence = Math.max(found.confidence, next.confidence);
  found.tags = Array.from(new Set([...found.tags, ...next.tags])).slice(0, 12);
  found.source = next.source || found.source;
  found.expiresAt = next.expiresAt;
  return items;
}

export class MemoryStore {
  private initRoot: string | null = null;
  private initPromise: Promise<void> | null = null;

  private paths(): { root: string; shortPath: string; longPath: string } {
    const root = path.join(process.cwd(), ".memory");
    return {
      root,
      shortPath: path.join(root, "short_term.jsonl"),
      longPath: path.join(root, "long_term.jsonl"),
    };
  }

  private async ensureInit(): Promise<void> {
    const paths = this.paths();
    if (this.initRoot !== paths.root) {
      this.initRoot = paths.root;
      this.initPromise = (async () => {
        await mkdir(paths.root, { recursive: true });
        await this.ensureFile(paths.shortPath);
        await this.ensureFile(paths.longPath);
      })();
    }
    await this.initPromise;
  }

  private async ensureFile(filePath: string): Promise<void> {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await writeFile(filePath, "", "utf8");
    }
  }

  private async loadLayer(layer: "short_term" | "long_term"): Promise<MemoryEntry[]> {
    await this.ensureInit();
    const { shortPath, longPath } = this.paths();
    const target = layer === "short_term" ? shortPath : longPath;
    const raw = await readFile(target, "utf8");
    const parsed = parseJsonl<Partial<MemoryEntry>>(raw);
    return parsed.map((item) => ({
      id: String(item.id ?? ""),
      source: String(item.source ?? "unknown"),
      type: asMemoryType(item.type),
      tags: asTags(item.tags),
      content: String(item.content ?? ""),
      confidence: normalizeConfidence(item.confidence),
      updatedAt: parseTimestampMs(item.updatedAt, nowTimestampMs()),
      expiresAt:
        item.expiresAt === null || item.expiresAt === undefined
          ? null
          : parseTimestampMs(item.expiresAt, nowTimestampMs()),
    }));
  }

  private async saveLayer(layer: "short_term" | "long_term", items: MemoryEntry[]): Promise<void> {
    const { shortPath, longPath } = this.paths();
    const target = layer === "short_term" ? shortPath : longPath;
    await writeFile(target, toJsonl(items), "utf8");
  }

  async add(
    sourceArg: unknown,
    typeArg: unknown,
    tagsArg: unknown,
    contentArg: unknown,
    confidenceArg: unknown,
  ): Promise<MemoryEntry | null> {
    const source = String(sourceArg ?? "").trim() || "manual";
    const content = sanitizeAndRedactText(String(contentArg ?? "").trim());
    if (!content) {
      return null;
    }
    const entry: MemoryEntry = {
      id: makeId(),
      source,
      type: asMemoryType(typeArg),
      tags: asTags(tagsArg),
      content,
      confidence: normalizeConfidence(confidenceArg),
      updatedAt: nowTimestampMs(),
      expiresAt: null,
    };

    const shortItems = await this.loadLayer("short_term");
    shortItems.push({
      ...entry,
      expiresAt: buildArtifactMetadata("memory_short_term", entry.updatedAt).expiresAt,
    });
    const capped = shortItems.slice(-RUNTIME_CONFIG.memoryShortTermLimit);
    await this.saveLayer("short_term", capped);

    const longItems = await this.loadLayer("long_term");
    const merged = dedupLongTerm(longItems, {
      ...entry,
      expiresAt: buildArtifactMetadata("memory_long_term", entry.updatedAt).expiresAt,
    });
    await this.saveLayer("long_term", merged);

    return entry;
  }

  async listLayer(layer: "short_term" | "long_term"): Promise<MemoryEntry[]> {
    const items = await this.loadLayer(layer);
    const active = items.filter((item) => !isExpired(item.expiresAt));
    if (active.length !== items.length) {
      await this.saveLayer(layer, active);
    }
    return active;
  }

  async delete(memoryId: string): Promise<boolean> {
    const id = String(memoryId ?? "").trim();
    if (!id) {
      return false;
    }
    const shortItems = await this.loadLayer("short_term");
    const longItems = await this.loadLayer("long_term");
    const nextShort = shortItems.filter((item) => item.id !== id);
    const nextLong = longItems.filter((item) => item.id !== id);
    const changed = nextShort.length !== shortItems.length || nextLong.length !== longItems.length;
    if (!changed) {
      return false;
    }
    await this.saveLayer("short_term", nextShort);
    await this.saveLayer("long_term", nextLong);
    return true;
  }
}
