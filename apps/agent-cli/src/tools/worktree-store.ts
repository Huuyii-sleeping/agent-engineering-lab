import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { nowTimestampMs, parseTimestampMs } from "../time.js";
import type { WorktreeCloseout, WorktreeEvent, WorktreeRecord, WorktreeStatus } from "./worktree-types.js";
import { WORKTREE_SCHEMA_VERSION } from "./worktree-types.js";

export function normalizeWorktreeCloseout(value: unknown): WorktreeCloseout | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const parsed = value as Partial<WorktreeCloseout>;
  if (parsed.action !== "keep" && parsed.action !== "remove") {
    return null;
  }
  return {
    action: parsed.action,
    at: Number.isFinite(Number(parsed.at)) ? Number(parsed.at) : nowTimestampMs(),
    forced: Boolean(parsed.forced),
  };
}

function normalizeWorktreeStatus(value: unknown): WorktreeStatus {
  return value === "created" ||
    value === "entered" ||
    value === "running" ||
    value === "kept" ||
    value === "removed"
    ? value
    : "created";
}

export class WorktreeStore {
  private readonly indexPath: string;
  private readonly eventsPath: string;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly root = path.join(process.cwd(), ".worktrees")) {
    this.indexPath = path.join(this.root, "index.json");
    this.eventsPath = path.join(this.root, "events.jsonl");
  }

  async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(this.root, { recursive: true });
        await this.ensureFile(this.indexPath, "[]\n");
        await this.ensureFile(this.eventsPath, "");
      })();
    }
    await this.initPromise;
  }

  private async ensureFile(filePath: string, initial: string): Promise<void> {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await writeFile(filePath, initial, "utf8");
    }
  }

  defaultPath(name: string): string {
    return path.join(this.root, name);
  }

  async loadIndex(): Promise<WorktreeRecord[]> {
    await this.ensureInit();
    const raw = await readFile(this.indexPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<WorktreeRecord>>;
    return parsed.map((item) => ({
      schemaVersion: WORKTREE_SCHEMA_VERSION,
      name: String(item.name ?? ""),
      path: String(item.path ?? ""),
      status: normalizeWorktreeStatus(item.status),
      createdAt: parseTimestampMs(item.createdAt, nowTimestampMs()),
      updatedAt: parseTimestampMs(item.updatedAt, nowTimestampMs()),
      lastEnteredAt:
        item.lastEnteredAt === null || item.lastEnteredAt === undefined
          ? null
          : parseTimestampMs(item.lastEnteredAt, nowTimestampMs()),
      lastCommandAt:
        item.lastCommandAt === null || item.lastCommandAt === undefined
          ? null
          : parseTimestampMs(item.lastCommandAt, nowTimestampMs()),
      lastCommandPreview: item.lastCommandPreview ? String(item.lastCommandPreview) : null,
      closeout: normalizeWorktreeCloseout(item.closeout),
    }));
  }

  async saveIndex(records: WorktreeRecord[]): Promise<void> {
    await writeFile(this.indexPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  async appendEvent(event: WorktreeEvent): Promise<void> {
    await writeFile(this.eventsPath, `${JSON.stringify(event)}\n`, { flag: "a", encoding: "utf8" });
  }
}
