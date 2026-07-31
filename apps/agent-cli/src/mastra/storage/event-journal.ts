import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type {
  AgentRuntimeEvent,
  RuntimeEventBase,
  WorkflowRuntimeEvent,
} from "@orbit/runtime-contracts";
import { isLocalPersistenceEnabled } from "../../runtime-config.js";
import { resolveMastraRuntimePaths } from "./paths.js";

type EventWithoutEnvelope<T> = T extends RuntimeEventBase ? Omit<T, keyof RuntimeEventBase> : never;

export type AgentRuntimeEventInput = EventWithoutEnvelope<AgentRuntimeEvent>;
export type WorkflowRuntimeEventInput = EventWithoutEnvelope<WorkflowRuntimeEvent>;

type RuntimeEventDomain = "agent" | "workflow";
type RuntimeJournalEvent = AgentRuntimeEvent | WorkflowRuntimeEvent;

type JournalState = {
  loaded: boolean;
  events: RuntimeJournalEvent[];
  pending: Promise<void>;
};

function journalKey(domain: RuntimeEventDomain, runId: string): string {
  return `${domain}:${runId}`;
}

function fileName(runId: string): string {
  return `${createHash("sha256").update(runId).digest("hex")}.jsonl`;
}

/** Agent/Workflow 共用基础设施、按领域和 run 分文件保存的产品事件 journal。 */
export class OrbitRuntimeEventJournal {
  private readonly paths;
  private readonly persistenceEnabled: boolean;
  private readonly states = new Map<string, JournalState>();
  private readonly subscribers = new Map<string, Set<(event: RuntimeJournalEvent) => void>>();

  constructor(options: { root?: string; persistenceEnabled?: boolean } = {}) {
    this.paths = resolveMastraRuntimePaths(options.root);
    this.persistenceEnabled = options.persistenceEnabled ?? isLocalPersistenceEnabled();
  }

  appendAgent(runId: string, input: AgentRuntimeEventInput): Promise<AgentRuntimeEvent> {
    return this.append("agent", runId, input) as Promise<AgentRuntimeEvent>;
  }

  appendWorkflow(runId: string, input: WorkflowRuntimeEventInput): Promise<WorkflowRuntimeEvent> {
    return this.append("workflow", runId, input) as Promise<WorkflowRuntimeEvent>;
  }

  async listAgent(runId: string, sinceId = 0): Promise<AgentRuntimeEvent[]> {
    return await this.list("agent", runId, sinceId) as AgentRuntimeEvent[];
  }

  async listWorkflow(runId: string, sinceId = 0): Promise<WorkflowRuntimeEvent[]> {
    return await this.list("workflow", runId, sinceId) as WorkflowRuntimeEvent[];
  }

  subscribeAgent(runId: string, listener: (event: AgentRuntimeEvent) => void): () => void {
    return this.subscribe("agent", runId, listener as (event: RuntimeJournalEvent) => void);
  }

  subscribeWorkflow(runId: string, listener: (event: WorkflowRuntimeEvent) => void): () => void {
    return this.subscribe("workflow", runId, listener as (event: RuntimeJournalEvent) => void);
  }

  /** 删除达到 retention 的 Workflow 产品事件和内存订阅状态。 */
  async removeWorkflow(runId: string): Promise<void> {
    const key = journalKey("workflow", runId);
    const state = this.states.get(key);
    await state?.pending.catch(() => undefined);
    this.states.delete(key);
    this.subscribers.delete(key);
    if (this.persistenceEnabled) await rm(this.filePath("workflow", runId), { force: true });
  }

  private async append(
    domain: RuntimeEventDomain,
    runId: string,
    input: AgentRuntimeEventInput | WorkflowRuntimeEventInput,
  ): Promise<RuntimeJournalEvent> {
    const state = this.state(domain, runId);
    let appended: RuntimeJournalEvent | null = null;
    const operation = state.pending.catch(() => undefined).then(async () => {
      await this.load(domain, runId, state);
      const event = {
        ...input,
        id: (state.events.at(-1)?.id ?? 0) + 1,
        runId,
        at: Date.now(),
      } as RuntimeJournalEvent;
      if (this.persistenceEnabled) {
        const filePath = this.filePath(domain, runId);
        await mkdir(path.dirname(filePath), { recursive: true });
        await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
      }
      state.events.push(event);
      appended = event;
      for (const subscriber of this.subscribers.get(journalKey(domain, runId)) ?? []) subscriber(event);
    });
    state.pending = operation;
    await operation;
    return appended!;
  }

  private async list(domain: RuntimeEventDomain, runId: string, sinceId: number): Promise<RuntimeJournalEvent[]> {
    const state = this.state(domain, runId);
    await state.pending.catch(() => undefined);
    await this.load(domain, runId, state);
    return state.events.filter((event) => event.id > sinceId).map((event) => structuredClone(event));
  }

  private subscribe(
    domain: RuntimeEventDomain,
    runId: string,
    listener: (event: RuntimeJournalEvent) => void,
  ): () => void {
    const key = journalKey(domain, runId);
    const listeners = this.subscribers.get(key) ?? new Set();
    listeners.add(listener);
    this.subscribers.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.subscribers.delete(key);
    };
  }

  private state(domain: RuntimeEventDomain, runId: string): JournalState {
    const key = journalKey(domain, runId);
    const current = this.states.get(key);
    if (current) return current;
    const created: JournalState = { loaded: false, events: [], pending: Promise.resolve() };
    this.states.set(key, created);
    return created;
  }

  private async load(domain: RuntimeEventDomain, runId: string, state: JournalState): Promise<void> {
    if (state.loaded) return;
    state.loaded = true;
    if (!this.persistenceEnabled) return;
    const raw = await readFile(this.filePath(domain, runId), "utf8").catch(() => "");
    state.events = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as RuntimeJournalEvent);
  }

  private filePath(domain: RuntimeEventDomain, runId: string): string {
    return path.join(this.paths.eventsRoot, domain, fileName(runId));
  }
}
