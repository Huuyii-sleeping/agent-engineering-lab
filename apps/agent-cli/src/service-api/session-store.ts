import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAgentRuntimeState } from "../bootstrap/app-runtime.js";
import type { PendingApprovalReplay } from "../runtime/query-types.js";
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

export class SessionStore {
  constructor(private readonly root: string = path.join(process.cwd(), ".sessions")) {}

  private sessionPath(sessionId: string): string {
    return path.join(this.root, sessionFilename(sessionId));
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async save(session: AgentSessionRecord): Promise<void> {
    await this.ensureRoot();
    const target = this.sessionPath(session.id);
    const temp = `${target}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    const payload = `${JSON.stringify(toPersistedSessionRecord(session), null, 2)}\n`;
    await writeFile(temp, payload, "utf8");
    await rename(temp, target);
  }

  async load(sessionId: string): Promise<AgentSessionRecord | null> {
    const target = this.sessionPath(sessionId);
    const raw = await readFile(target, "utf8").catch(() => "");
    if (!raw.trim()) {
      return null;
    }
    return fromPersistedSessionRecord(JSON.parse(raw) as PersistedSessionRecord);
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
        const raw = await readFile(path.join(this.root, file), "utf8");
        return fromPersistedSessionRecord(JSON.parse(raw) as PersistedSessionRecord);
      }),
    );
    return sessions;
  }
}
