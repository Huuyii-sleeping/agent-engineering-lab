import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { resolveAgentServiceBaseUrl } from "./config.js";

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
  private readonly sessions = new Map<string, RemoteSessionRecord>();
  private sessionOrder: string[] = [];

  constructor(options: AgentServiceClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? resolveAgentServiceBaseUrl();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.manifest = normalizeManifest(this.baseUrl, {
      ok: true,
      name: "agent-cli-bridge",
      version: "0.1.0",
      capabilities: {
        chat: true,
        sessions: true,
        tools: true,
        events: true,
      },
      endpoints: {
        health: "/health",
        chat: "/chat",
        tools: "/tools",
        toolCall: "/tools/call",
        sessions: "/sessions",
        sessionDetail: "/sessions/:id",
        events: "/events",
      },
    });
  }

  async initialize(): Promise<void> {
    await this.requestJson("GET", "/health");
    this.manifest = normalizeManifest(this.baseUrl, await this.requestJson("GET", "/bridge"));
    await this.refreshSessions();
  }

  bridgeManifest(): JsonObject {
    return this.manifest;
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
}
