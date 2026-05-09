import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { parseJsonl, toJsonl } from "./jsonl.js";
import { asMemoryType, asTags, normalizeConfidence, normalizeMemoryText } from "./normalize.js";
import type { MemoryEntry } from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

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
  return items;
}

export class MemoryStore {
  private readonly root = path.join(process.cwd(), ".memory");
  private readonly shortPath = path.join(this.root, "short_term.jsonl");
  private readonly longPath = path.join(this.root, "long_term.jsonl");
  private initPromise: Promise<void> | null = null;

  private async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(this.root, { recursive: true });
        await this.ensureFile(this.shortPath);
        await this.ensureFile(this.longPath);
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
    const target = layer === "short_term" ? this.shortPath : this.longPath;
    const raw = await readFile(target, "utf8");
    const parsed = parseJsonl<Partial<MemoryEntry>>(raw);
    return parsed.map((item) => ({
      id: String(item.id ?? ""),
      source: String(item.source ?? "unknown"),
      type: asMemoryType(item.type),
      tags: asTags(item.tags),
      content: String(item.content ?? ""),
      confidence: normalizeConfidence(item.confidence),
      updatedAt: String(item.updatedAt ?? nowIso()),
    }));
  }

  private async saveLayer(layer: "short_term" | "long_term", items: MemoryEntry[]): Promise<void> {
    const target = layer === "short_term" ? this.shortPath : this.longPath;
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
    const content = String(contentArg ?? "").trim();
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
      updatedAt: nowIso(),
    };

    const shortItems = await this.loadLayer("short_term");
    shortItems.push(entry);
    const capped = shortItems.slice(-RUNTIME_CONFIG.memoryShortTermLimit);
    await this.saveLayer("short_term", capped);

    const longItems = await this.loadLayer("long_term");
    const merged = dedupLongTerm(longItems, entry);
    await this.saveLayer("long_term", merged);

    return entry;
  }

  async listLayer(layer: "short_term" | "long_term"): Promise<MemoryEntry[]> {
    return this.loadLayer(layer);
  }
}
