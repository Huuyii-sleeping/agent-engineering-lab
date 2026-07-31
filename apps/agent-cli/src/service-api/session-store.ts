import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isLocalPersistenceEnabled } from "../runtime-config.js";
import { buildArtifactMetadata, isExpired } from "../security/local-retention.js";
import { sanitizeAndRedactValue } from "../security/data-hygiene.js";
import type {
  AgentRuntimeContext,
  AgentSessionMemoryBinding,
  AgentSessionRecord,
} from "./sessions.js";
import { normalizeAgentRuntimeContext } from "./sessions.js";

type PersistedSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  busy: boolean;
  history: AgentSessionRecord["history"];
  rounds?: number;
  runtimeState?: { roundCounter?: number };
  agent?: AgentRuntimeContext | null;
  memoryBinding?: AgentSessionMemoryBinding;
  runtimeBinding?: AgentSessionRecord["runtimeBinding"];
};

type PersistedSessionEnvelope = {
  schemaVersion: 1;
  kind: "session";
  event?: "session.saved";
  createdAt: number;
  expiresAt: number;
  session: PersistedSessionRecord;
};

const RETRYABLE_RENAME_ERROR_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function sessionFilename(sessionId: string): string {
  return `session_${sessionId}.json`;
}

function sessionJournalFilename(sessionId: string): string {
  return `session_${sessionId}.jsonl`;
}

function sessionIdFromFilename(fileName: string, extension: ".json" | ".jsonl"): string {
  return fileName.slice("session_".length, -extension.length);
}

function toPersistedSessionRecord(session: AgentSessionRecord): PersistedSessionRecord {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    busy: session.busy,
    history: session.history,
    rounds: session.rounds,
    agent: session.agent,
    memoryBinding: session.memoryBinding,
    runtimeBinding: session.runtimeBinding,
  };
}

function toPersistedSessionEnvelope(session: AgentSessionRecord): PersistedSessionEnvelope {
  const record = sanitizeAndRedactValue(
    toPersistedSessionRecord(session),
  ) as PersistedSessionRecord;
  const metadata = buildArtifactMetadata("session");
  return {
    schemaVersion: 1,
    kind: "session",
    event: "session.saved",
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
    session: record,
  };
}

function fromPersistedSessionRecord(input: PersistedSessionRecord): AgentSessionRecord {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    busy: input.busy,
    history: input.history,
    rounds: Number(input.rounds ?? input.runtimeState?.roundCounter ?? 0),
    agent: normalizeAgentRuntimeContext(input.agent),
    memoryBinding: input.memoryBinding,
    runtimeBinding: input.runtimeBinding ?? {
      backend: "mastra",
      adapterVersion: "mastra-agent-v1",
      runtimeVersion: "1.52.1",
      selectionReason: "mastra-only session restored",
    },
  };
}

function fromPersistedSessionEnvelope(input: PersistedSessionEnvelope): AgentSessionRecord {
  return fromPersistedSessionRecord(input.session);
}

function isPersistedSessionEnvelope(
  input: PersistedSessionRecord | PersistedSessionEnvelope,
): input is PersistedSessionEnvelope {
  return "kind" in input && input.kind === "session";
}

export class SessionStore {
  private readonly pendingWrites = new Map<string, Promise<void>>();

  constructor(private readonly root: string = path.join(process.cwd(), ".sessions")) {}

  private sessionPath(sessionId: string): string {
    return path.join(this.root, sessionFilename(sessionId));
  }

  private sessionJournalPath(sessionId: string): string {
    return path.join(this.root, sessionJournalFilename(sessionId));
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  private async pruneExpiredSessionFile(filePath: string): Promise<boolean> {
    const raw = await readFile(filePath, "utf8").catch(() => "");
    if (!raw.trim()) {
      return false;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedSessionEnvelope>;
      if (parsed.kind !== "session") {
        return false;
      }
      if (!isExpired(parsed.expiresAt ?? null)) {
        return false;
      }
      await rm(filePath, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  private async replaceSessionFile(temp: string, target: string): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      await rm(target, { force: true }).catch(() => {});
      try {
        await rename(temp, target);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "";
        if (!RETRYABLE_RENAME_ERROR_CODES.has(code) || attempt >= 4) {
          await rm(temp, { force: true }).catch(() => {});
          throw error;
        }
        await delay(25 * (attempt + 1));
      }
    }
  }

  private async appendSessionJournal(target: string, envelope: PersistedSessionEnvelope): Promise<void> {
    await appendFile(target, `${JSON.stringify(envelope)}\n`, "utf8");
  }

  private parseJournalSessionLine(raw: string): PersistedSessionEnvelope | null {
    if (!raw.trim()) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedSessionEnvelope>;
      if (parsed.kind !== "session" || !parsed.session) {
        return null;
      }
      return parsed as PersistedSessionEnvelope;
    } catch {
      return null;
    }
  }

  private async loadLatestJournalSession(sessionId: string): Promise<AgentSessionRecord | null> {
    const target = this.sessionJournalPath(sessionId);
    const raw = await readFile(target, "utf8").catch(() => "");
    if (!raw.trim()) {
      return null;
    }
    const rows = raw.trim().split(/\r?\n/).reverse();
    let sawSessionRecord = false;
    for (const row of rows) {
      const envelope = this.parseJournalSessionLine(row);
      if (!envelope) {
        continue;
      }
      sawSessionRecord = true;
      if (isExpired(envelope.expiresAt ?? null)) {
        continue;
      }
      return fromPersistedSessionEnvelope(envelope);
    }
    if (sawSessionRecord) {
      await rm(target, { force: true }).catch(() => {});
    }
    return null;
  }

  private async enqueueWrite(sessionId: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.pendingWrites.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.pendingWrites.set(sessionId, next);
    try {
      await next;
    } finally {
      if (this.pendingWrites.get(sessionId) === next) {
        this.pendingWrites.delete(sessionId);
      }
    }
  }

  async save(session: AgentSessionRecord): Promise<void> {
    if (!isLocalPersistenceEnabled()) {
      return;
    }
    await this.enqueueWrite(session.id, async () => {
      await this.ensureRoot();
      const target = this.sessionPath(session.id);
      const journal = this.sessionJournalPath(session.id);
      const temp = `${target}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      const envelope = toPersistedSessionEnvelope(session);
      const payload = `${JSON.stringify(envelope, null, 2)}\n`;
      await this.appendSessionJournal(journal, envelope);
      await writeFile(temp, payload, "utf8");
      await this.replaceSessionFile(temp, target);
    });
  }

  async load(sessionId: string): Promise<AgentSessionRecord | null> {
    if (!isLocalPersistenceEnabled()) {
      return null;
    }
    const journalSession = await this.loadLatestJournalSession(sessionId);
    if (journalSession) {
      return journalSession;
    }
    const target = this.sessionPath(sessionId);
    const raw = await readFile(target, "utf8").catch(() => "");
    if (!raw.trim()) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedSessionRecord | PersistedSessionEnvelope;
    if (isPersistedSessionEnvelope(parsed)) {
      if (isExpired(parsed.expiresAt ?? null)) {
        await rm(target, { force: true }).catch(() => {});
        return null;
      }
      return fromPersistedSessionEnvelope(parsed);
    }
    return fromPersistedSessionRecord(parsed);
  }

  async list(): Promise<AgentSessionRecord[]> {
    if (!isLocalPersistenceEnabled()) {
      return [];
    }
    await this.ensureRoot();
    const entries = await readdir(this.root, { withFileTypes: true });
    const sessions = new Map<string, AgentSessionRecord>();
    const journalFiles = entries
      .filter((entry) => entry.isFile() && /^session_.+\.jsonl$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    for (const file of journalFiles) {
      const sessionId = sessionIdFromFilename(file, ".jsonl");
      const session = await this.loadLatestJournalSession(sessionId);
      if (session) {
        sessions.set(session.id, session);
      }
    }
    const files = entries
      .filter((entry) => entry.isFile() && /^session_.+\.json$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      const sessionId = sessionIdFromFilename(file, ".json");
      if (sessions.has(sessionId)) {
        continue;
      }
      const full = path.join(this.root, file);
      if (await this.pruneExpiredSessionFile(full)) {
        continue;
      }
      const raw = await readFile(full, "utf8");
      const parsed = JSON.parse(raw) as PersistedSessionRecord | PersistedSessionEnvelope;
      const session = isPersistedSessionEnvelope(parsed)
        ? fromPersistedSessionEnvelope(parsed)
        : fromPersistedSessionRecord(parsed);
      sessions.set(session.id, session);
    }
    return [...sessions.values()];
  }

  async delete(sessionId: string): Promise<boolean> {
    if (!isLocalPersistenceEnabled()) {
      return false;
    }
    let deleted = false;
    await this.enqueueWrite(sessionId, async () => {
      const target = this.sessionPath(sessionId);
      const journal = this.sessionJournalPath(sessionId);
      const exists = Boolean((await readFile(target, "utf8").catch(() => "")).trim());
      const journalExists = Boolean((await readFile(journal, "utf8").catch(() => "")).trim());
      if (!exists) {
        if (!journalExists) {
          deleted = false;
          return;
        }
        await rm(journal, { force: true });
        deleted = true;
        return;
      }
      await rm(target, { force: true });
      await rm(journal, { force: true });
      deleted = true;
    });
    return deleted;
  }
}
