import type { AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import type { AgentSessionRecord } from "../service-api/sessions.js";
import { createAgentSessionRecord } from "../service-api/sessions.js";
import { nowMs } from "../service-api/sessions.js";
import { sortSessionsByCreatedAt } from "../service-api/sessions.js";
import { summarizeSession } from "../service-api/sessions.js";
import { SessionStore } from "../service-api/session-store.js";
import type { AgentHostEvent } from "./events.js";
import type { AgentHostEventSubscriber } from "./events.js";

export class AgentHost {
  private readonly sessions = new Map<string, AgentSessionRecord>();
  private readonly eventSubscribers = new Set<AgentHostEventSubscriber>();
  private eventCounter = 0;

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

  subscribeEvents(subscriber: AgentHostEventSubscriber): () => void {
    this.eventSubscribers.add(subscriber);
    return () => {
      this.eventSubscribers.delete(subscriber);
    };
  }

  emitEvent(type: AgentHostEvent["type"], payload: Record<string, unknown>): AgentHostEvent {
    const event: AgentHostEvent = {
      id: this.eventCounter,
      at: nowMs(),
      type,
      payload,
    };
    this.eventCounter += 1;
    for (const subscriber of this.eventSubscribers) {
      subscriber(event);
    }
    return event;
  }

  createSessionSync(): AgentSessionRecord {
    const session = createAgentSessionRecord();
    this.sessions.set(session.id, session);
    this.emitEvent("session.created", { session: summarizeSession(session) });
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
