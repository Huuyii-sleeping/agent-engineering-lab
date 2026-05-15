import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { resolveAgentServiceBaseUrl } from "./config.js";
import { createAgentBridgeManifest } from "./bridge.js";

type JsonObject = Record<string, unknown>;

type RequestOptions = {
  allowErrorStatus?: boolean;
};

type AgentServiceClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type RemoteSessionRecord = {
  id: string;
  createdAt: number | null;
  updatedAt: number | null;
  busy: boolean;
  history: ChatCompletionMessageParam[];
  messageCount: number;
  rounds: number | null;
};

function getObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : Boolean(value);
}

function getMessages(value: unknown): ChatCompletionMessageParam[] {
  return Array.isArray(value) ? (value as ChatCompletionMessageParam[]) : [];
}

function normalizeManifest(baseUrl: string, manifest: JsonObject): JsonObject {
  const endpoints = getObject(manifest.endpoints);
  const normalizedEndpoints: JsonObject = {};
  for (const [key, value] of Object.entries(endpoints)) {
    normalizedEndpoints[key] = typeof value === "string" ? new URL(value, baseUrl).toString() : value;
  }
  return {
    ...manifest,
    ok: manifest.ok ?? true,
    endpoints: normalizedEndpoints,
  };
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function cloneSession(session: RemoteSessionRecord): RemoteSessionRecord {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    busy: session.busy,
    history: [...session.history],
    messageCount: session.messageCount,
    rounds: session.rounds,
  };
}

export class AgentServiceClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private manifest: JsonObject;
  private bridgeStateSnapshot: JsonObject | null = null;
  private readonly sessions = new Map<string, RemoteSessionRecord>();
  private sessionOrder: string[] = [];

  constructor(options: AgentServiceClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? resolveAgentServiceBaseUrl();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.manifest = normalizeManifest(this.baseUrl, createAgentBridgeManifest() as JsonObject);
  }

  async initialize(): Promise<void> {
    await this.requestJson("GET", "/health");
    this.manifest = normalizeManifest(this.baseUrl, await this.requestJson("GET", "/bridge"));
    await this.refreshBridgeState();
    await this.refreshSessions();
  }

  bridgeManifest(): JsonObject {
    return cloneJsonObject(this.manifest);
  }

  bridgeState(): JsonObject | null {
    return this.bridgeStateSnapshot ? cloneJsonObject(this.bridgeStateSnapshot) : null;
  }

  async refreshBridgeState(): Promise<JsonObject | null> {
    const response = await this.requestJson(
      "GET",
      this.resolveEndpoint("bridgeState", "/bridge/state"),
      undefined,
      { allowErrorStatus: true },
    );
    if (response.ok === false) {
      this.bridgeStateSnapshot = null;
      return null;
    }
    this.bridgeStateSnapshot = response;
    this.hydrateSessionSummariesFromBridgeState(response);
    return this.bridgeState();
  }

  listSessions(): RemoteSessionRecord[] {
    return this.sessionOrder.flatMap((id) => {
      const session = this.sessions.get(id);
      return session ? [cloneSession(session)] : [];
    });
  }

  async createSession(): Promise<{ id: string }> {
    const response = await this.requestJson("POST", "/sessions", {});
    const session = getObject(response.session);
    const id = getString(session.id);
    if (!id) {
      throw new Error("daemon session creation did not return a session id");
    }
    await this.refreshSession(id).catch(() => {
      this.upsertSession({
        id,
        createdAt: getNumber(session.createdAt),
        updatedAt: getNumber(session.updatedAt),
        busy: getBoolean(session.busy),
        history: [],
        messageCount: Number(session.messageCount ?? 0),
        rounds: getNumber(session.rounds),
      });
    });
    return { id };
  }

  async getSessionDetail(sessionId: string): Promise<Record<string, unknown> | null> {
    const normalizedId = sessionId.trim();
    if (!normalizedId) {
      return null;
    }
    try {
      const response = await this.requestJson(
        "GET",
        `/sessions/${encodeURIComponent(normalizedId)}`,
        undefined,
        { allowErrorStatus: true },
      );
      if (response.ok === false) {
        return null;
      }
      const session = getObject(response.session);
      const history = getMessages(session.messages);
      this.upsertSession({
        id: normalizedId,
        createdAt: getNumber(session.createdAt),
        updatedAt: getNumber(session.updatedAt),
        busy: getBoolean(session.busy),
        history,
        messageCount: Number(session.messageCount ?? history.length),
        rounds: getNumber(session.rounds),
      });
      return {
        id: normalizedId,
        createdAt: getNumber(session.createdAt),
        updatedAt: getNumber(session.updatedAt),
        busy: getBoolean(session.busy),
        messageCount: Number(session.messageCount ?? history.length),
        rounds: getNumber(session.rounds),
        messages: history,
      };
    } catch {
      return null;
    }
  }

  async toolsMetadata(): Promise<Array<Record<string, string>>> {
    try {
      const response = await this.requestJson("GET", "/tools");
      const tools = Array.isArray(response.tools) ? response.tools : [];
      return tools.map((tool) => {
        const record = getObject(tool);
        return Object.fromEntries(
          Object.entries(record).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
        );
      });
    } catch {
      return [];
    }
  }

  async chat(input: { session_id?: string; message?: string }): Promise<Record<string, unknown>> {
    try {
      const response = await this.requestJson("POST", "/chat", input, { allowErrorStatus: true });
      const session = getObject(response.session);
      const sessionId = getString(session.id) || getString(input.session_id);
      if (sessionId) {
        await this.refreshSession(sessionId).catch(() => {
          this.upsertSession({
            id: sessionId,
            createdAt: getNumber(session.createdAt),
            updatedAt: getNumber(session.updatedAt),
            busy: getBoolean(session.busy),
            history: [],
            messageCount: Number(session.messageCount ?? 0),
            rounds: getNumber(session.rounds),
          });
        });
      }
      return response;
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "DAEMON_UNAVAILABLE",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async runToolByName(name: string, argumentsJson: string): Promise<string> {
    try {
      const response = await this.requestJson(
        "POST",
        "/tools/call",
        { name, arguments_json: argumentsJson },
        { allowErrorStatus: true },
      );
      if (typeof response.output === "string") {
        return response.output;
      }
      return JSON.stringify(response, null, 2);
    } catch (error) {
      return JSON.stringify(
        {
          ok: false,
          error: {
            code: "DAEMON_UNAVAILABLE",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        null,
        2,
      );
    }
  }

  private async requestJson(
    method: string,
    pathname: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<JsonObject> {
    const response = await this.fetchImpl(new URL(pathname, this.baseUrl), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    const parsed = raw.trim() ? (JSON.parse(raw) as JsonObject) : {};
    if (!response.ok && !options.allowErrorStatus) {
      const error = getObject(parsed.error);
      throw new Error(
        String(error.message ?? `request failed: ${method} ${pathname} (${response.status})`),
      );
    }
    return parsed;
  }

  private async refreshSessions(): Promise<void> {
    const response = await this.requestJson("GET", "/sessions");
    const sessions = Array.isArray(response.sessions) ? response.sessions : [];
    const order: string[] = [];
    const hydrated: RemoteSessionRecord[] = [];
    for (const item of sessions) {
      const summary = getObject(item);
      const id = getString(summary.id);
      if (!id) {
        continue;
      }
      order.push(id);
      hydrated.push(await this.readSession(id, summary));
    }
    this.sessionOrder = order;
    this.sessions.clear();
    for (const session of hydrated) {
      this.sessions.set(session.id, session);
    }
  }

  private async refreshSession(id: string): Promise<void> {
    const session = await this.readSession(id);
    this.upsertSession(session);
  }

  private resolveEndpoint(key: string, fallbackPath: string): string {
    const endpoints = getObject(this.manifest.endpoints);
    const endpoint = endpoints[key];
    return typeof endpoint === "string" ? endpoint : fallbackPath;
  }

  private async readSession(id: string, fallbackSummary?: JsonObject): Promise<RemoteSessionRecord> {
    const response = await this.requestJson("GET", `/sessions/${encodeURIComponent(id)}`);
    const session = getObject(response.session);
    const summary = fallbackSummary ?? session;
    const history = getMessages(session.messages);
    return {
      id,
      createdAt: getNumber(session.createdAt ?? summary.createdAt),
      updatedAt: getNumber(session.updatedAt ?? summary.updatedAt),
      busy: getBoolean(session.busy ?? summary.busy),
      history,
      messageCount: Number(session.messageCount ?? summary.messageCount ?? history.length),
      rounds: getNumber(session.rounds ?? summary.rounds),
    };
  }

  private upsertSession(session: RemoteSessionRecord): void {
    this.sessions.set(session.id, session);
    if (!this.sessionOrder.includes(session.id)) {
      this.sessionOrder = [...this.sessionOrder, session.id];
    }
  }

  private hydrateSessionSummariesFromBridgeState(state: JsonObject): void {
    const summaries = Array.isArray(state.sessions) ? state.sessions : [];
    const order: string[] = [];
    const nextSessions = new Map<string, RemoteSessionRecord>();
    for (const item of summaries) {
      const summary = getObject(item);
      const id = getString(summary.id);
      if (!id) {
        continue;
      }
      order.push(id);
      const existing = this.sessions.get(id);
      nextSessions.set(id, {
        id,
        createdAt: getNumber(summary.createdAt ?? existing?.createdAt),
        updatedAt: getNumber(summary.updatedAt ?? existing?.updatedAt),
        busy: getBoolean(summary.busy ?? existing?.busy),
        history: existing?.history ? [...existing.history] : [],
        messageCount: Number(summary.messageCount ?? existing?.messageCount ?? 0),
        rounds: getNumber(summary.rounds ?? existing?.rounds),
      });
    }
    this.sessionOrder = order;
    this.sessions.clear();
    for (const [id, session] of nextSessions) {
      this.sessions.set(id, session);
    }
  }
}
