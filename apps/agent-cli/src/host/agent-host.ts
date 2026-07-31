import type { AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import type { AgentSessionRecord } from "../service-api/sessions.js";
import { createAgentSessionRecord } from "../service-api/sessions.js";
import type { AgentRuntimeContext } from "../service-api/sessions.js";
import { nowMs } from "../service-api/sessions.js";
import { sortSessionsByCreatedAt } from "../service-api/sessions.js";
import { summarizeSession } from "../service-api/sessions.js";
import { SessionStore } from "../service-api/session-store.js";
import type { AgentHostEvent } from "./events.js";
import type { AgentHostEventSubscriber } from "./events.js";

const DEFAULT_EVENT_BUFFER_LIMIT = 128;

export type AgentHostEventWindow = {
  oldestEventId: number | null;
  latestEventId: number | null;
  bufferedEventCount: number;
};

export class AgentHost {
  private readonly sessions = new Map<string, AgentSessionRecord>();
  private readonly eventSubscribers = new Set<AgentHostEventSubscriber>();
  private readonly eventBuffer: AgentHostEvent[] = [];
  private readonly eventBufferLimit: number;
  private eventCounter = 0;

  constructor(
    private readonly deps: AgentAppRuntimeDeps,
    private readonly sessionStore: SessionStore = new SessionStore(),
    options: { eventBufferLimit?: number } = {},
  ) {
    const configuredLimit = Math.trunc(options.eventBufferLimit ?? DEFAULT_EVENT_BUFFER_LIMIT);
    this.eventBufferLimit = configuredLimit > 0 ? configuredLimit : DEFAULT_EVENT_BUFFER_LIMIT;
  }

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

  listEventsSince(cursor: number | null = null): AgentHostEvent[] {
    return this.eventBuffer.filter((event) => cursor === null || event.id > cursor);
  }

  eventWindow(): AgentHostEventWindow {
    return {
      oldestEventId: this.eventBuffer[0]?.id ?? null,
      latestEventId: this.eventBuffer.at(-1)?.id ?? null,
      bufferedEventCount: this.eventBuffer.length,
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
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.eventBufferLimit) {
      this.eventBuffer.splice(0, this.eventBuffer.length - this.eventBufferLimit);
    }
    for (const subscriber of this.eventSubscribers) {
      subscriber(event);
    }
    return event;
  }

  createSessionSync(agent: AgentRuntimeContext | null = null): AgentSessionRecord {
    const session = createAgentSessionRecord(undefined, undefined, agent);
    this.sessions.set(session.id, session);
    this.emitEvent("session.created", { session: summarizeSession(session) });
    return session;
  }

  /** 使用产品指定的 thread/session id 创建 session。 */
  createSessionWithId(sessionId: string, agent: AgentRuntimeContext | null = null): AgentSessionRecord {
    if (this.sessions.has(sessionId)) {
      throw new Error(`session already exists: ${sessionId}`);
    }
    const session = createAgentSessionRecord(sessionId, undefined, agent);
    this.sessions.set(session.id, session);
    this.emitEvent("session.created", { session: summarizeSession(session) });
    return session;
  }

  async createSession(agent: AgentRuntimeContext | null = null): Promise<AgentSessionRecord> {
    const session = this.createSessionSync(agent);
    await this.sessionStore.save(session);
    return session;
  }

  async persistSession(session: AgentSessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
    await this.sessionStore.save(session);
  }

  /** 删除 Memory thread 对应的 session 及持久化记录。 */
  async deleteSession(sessionId: string): Promise<boolean> {
    const existed = this.sessions.delete(sessionId);
    const persisted = await this.sessionStore.delete(sessionId);
    return existed || persisted;
  }
}
