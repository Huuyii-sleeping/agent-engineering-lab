import type { AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import type { AgentSessionRecord } from "../service-api/sessions.js";
import { createAgentSessionRecord } from "../service-api/sessions.js";
import { sortSessionsByCreatedAt } from "../service-api/sessions.js";
import { SessionStore } from "../service-api/session-store.js";

export class AgentHost {
  private readonly sessions = new Map<string, AgentSessionRecord>();

  constructor(
    private readonly deps: AgentAppRuntimeDeps,
    private readonly sessionStore: SessionStore = new SessionStore(),
  ) {}

  runtime(): AgentAppRuntimeDeps {
    return this.deps;
  }

  async initialize(): Promise<void> {
    const records = await this.sessionStore.list();
    this.sessions.clear();
    for (const session of records) {
      this.sessions.set(session.id, session);
    }
  }

  listSessions(): AgentSessionRecord[] {
    return sortSessionsByCreatedAt(this.sessions.values());
  }

  getSession(sessionId: string): AgentSessionRecord | null {
    return this.sessions.get(sessionId) ?? null;
  }

  createSessionSync(): AgentSessionRecord {
    const session = createAgentSessionRecord();
    this.sessions.set(session.id, session);
    return session;
  }

  async createSession(): Promise<AgentSessionRecord> {
    const session = this.createSessionSync();
    await this.sessionStore.save(session);
    return session;
  }

  async persistSession(session: AgentSessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
    await this.sessionStore.save(session);
  }
}
