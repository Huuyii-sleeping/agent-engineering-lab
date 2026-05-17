import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createAgentRuntimeState } from "../bootstrap/app-runtime.js";
import type { PendingApprovalReplay } from "../runtime/query-types.js";
import { buildArtifactMetadata, isExpired } from "../security/local-retention.js";
import { sanitizeAndRedactValue } from "../security/data-hygiene.js";
import type { AgentSessionRecord } from "./sessions.js";

type PersistedRuntimeState = {
  sessionId: string;
  roundsWithoutTodo: number;
  activeTaskId: number | null;
  lastMemoryInput: string | null;
  roundCounter: number;
  touchedPaths: string[];
  wroteWorkspaceFiles: boolean;
  pendingApprovalCandidate: PendingApprovalReplay | null;
  pendingApprovalReplays: PendingApprovalReplay[];
};

type PersistedSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  busy: boolean;
  history: AgentSessionRecord["history"];
  runtimeState: PersistedRuntimeState;
};

type PersistedSessionEnvelope = {
  schemaVersion: 1;
  kind: "session";
  createdAt: number;
  expiresAt: number;
  session: PersistedSessionRecord;
};

const RETRYABLE_RENAME_ERROR_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function sessionFilename(sessionId: string): string {
  return `session_${sessionId}.json`;
}

function toPersistedRuntimeState(session: AgentSessionRecord): PersistedRuntimeState {
  return {
    sessionId: session.runtimeState.sessionId,
    roundsWithoutTodo: session.runtimeState.roundsWithoutTodo,
    activeTaskId: session.runtimeState.activeTaskId,
    lastMemoryInput: session.runtimeState.lastMemoryInput,
    roundCounter: session.runtimeState.roundCounter,
    touchedPaths: [...session.runtimeState.touchedPaths],
    wroteWorkspaceFiles: session.runtimeState.wroteWorkspaceFiles,
    pendingApprovalCandidate: session.runtimeState.pendingApprovalCandidate ?? null,
    pendingApprovalReplays: [...(session.runtimeState.pendingApprovalReplays?.values() ?? [])],
  };
}

function fromPersistedRuntimeState(input: PersistedRuntimeState): AgentSessionRecord["runtimeState"] {
  const runtimeState = createAgentRuntimeState(input.sessionId);
  runtimeState.roundsWithoutTodo = Number(input.roundsWithoutTodo ?? 0);
  runtimeState.activeTaskId =
    typeof input.activeTaskId === "number" ? input.activeTaskId : null;
  runtimeState.lastMemoryInput =
    typeof input.lastMemoryInput === "string" ? input.lastMemoryInput : null;
  runtimeState.roundCounter = Number(input.roundCounter ?? 0);
  runtimeState.touchedPaths = new Set(
    Array.isArray(input.touchedPaths) ? input.touchedPaths.map((item) => String(item)) : [],
  );
  runtimeState.wroteWorkspaceFiles = Boolean(input.wroteWorkspaceFiles);
  runtimeState.pendingApprovalCandidate = input.pendingApprovalCandidate ?? null;
  runtimeState.pendingApprovalReplays = new Map(
    (Array.isArray(input.pendingApprovalReplays) ? input.pendingApprovalReplays : []).map((item) => [
      item.requestId ?? `${item.toolName}:${item.createdAt}`,
      item,
    ]),
  );
  return runtimeState;
}

function toPersistedSessionRecord(session: AgentSessionRecord): PersistedSessionRecord {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    busy: session.busy,
    history: session.history,
    runtimeState: toPersistedRuntimeState(session),
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
    runtimeState: fromPersistedRuntimeState(input.runtimeState),
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
    await this.enqueueWrite(session.id, async () => {
      await this.ensureRoot();
      const target = this.sessionPath(session.id);
      const temp = `${target}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      const payload = `${JSON.stringify(toPersistedSessionEnvelope(session), null, 2)}\n`;
      await writeFile(temp, payload, "utf8");
      await this.replaceSessionFile(temp, target);
    });
  }

  async load(sessionId: string): Promise<AgentSessionRecord | null> {
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
    await this.ensureRoot();
    const entries = await readdir(this.root, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && /^session_.+\.json$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    const sessions = await Promise.all(
      files.map(async (file) => {
        const full = path.join(this.root, file);
        if (await this.pruneExpiredSessionFile(full)) {
          return null;
        }
        const raw = await readFile(full, "utf8");
        const parsed = JSON.parse(raw) as PersistedSessionRecord | PersistedSessionEnvelope;
        if (isPersistedSessionEnvelope(parsed)) {
          return fromPersistedSessionEnvelope(parsed);
        }
        return fromPersistedSessionRecord(parsed);
      }),
    );
    return sessions.filter((item): item is AgentSessionRecord => Boolean(item));
  }

  async delete(sessionId: string): Promise<boolean> {
    let deleted = false;
    await this.enqueueWrite(sessionId, async () => {
      const target = this.sessionPath(sessionId);
      const exists = Boolean((await readFile(target, "utf8").catch(() => "")).trim());
      if (!exists) {
        deleted = false;
        return;
      }
      await rm(target, { force: true });
      deleted = true;
    });
    return deleted;
  }
}
