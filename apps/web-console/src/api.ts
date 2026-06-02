/** Role names returned by the agent service transcript API. */
export type ChatRole = "system" | "user" | "assistant" | "tool";

/** Chat transcript message shape consumed by the Web console. */
export type ChatMessage = {
  role: ChatRole;
  content?: string | null;
  tool_call_id?: string;
  name?: string;
};

/** Compact session record used by the session list and status panel. */
export type SessionSummary = {
  id: string;
  createdAt: number | null;
  updatedAt: number | null;
  busy: boolean;
  messageCount: number;
  rounds: number | null;
};

/** Session detail DTO with normalized transcript messages. */
export type SessionDetail = SessionSummary & {
  messages: ChatMessage[];
};

/** BFF and upstream agent health state displayed in the top bar. */
export type HealthStatus = {
  ok: boolean;
  connected: boolean;
  bffStatus: string;
  agentStatus: string;
};

/** Result returned after sending a user message to the active session. */
export type SendMessageResult = {
  ok: boolean;
  assistant?: string;
  session?: SessionSummary;
  error?: {
    code: string;
    message: string;
  };
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : Boolean(value);
}

function normalizeMessage(value: unknown): ChatMessage | null {
  const record = asObject(value);
  const role = asString(record.role);
  if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
    return null;
  }
  const content = record.content;
  return {
    role,
    content: typeof content === "string" ? content : content === null ? null : JSON.stringify(content ?? ""),
    tool_call_id: typeof record.tool_call_id === "string" ? record.tool_call_id : undefined,
    name: typeof record.name === "string" ? record.name : undefined,
  };
}

function normalizeSessionSummary(value: unknown): SessionSummary {
  const record = asObject(value);
  return {
    id: asString(record.id),
    createdAt: asNumber(record.createdAt),
    updatedAt: asNumber(record.updatedAt),
    busy: asBoolean(record.busy),
    messageCount: Number(record.messageCount ?? 0),
    rounds: asNumber(record.rounds),
  };
}

function normalizeSessionDetail(value: unknown): SessionDetail {
  const record = asObject(value);
  const summary = normalizeSessionSummary(record);
  const messages = Array.isArray(record.messages)
    ? record.messages.map(normalizeMessage).filter((item): item is ChatMessage => Boolean(item))
    : [];
  return { ...summary, messages };
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const raw = await response.text();
  const parsed = raw.trim() ? (JSON.parse(raw) as JsonObject) : {};
  if (!response.ok || parsed.ok === false) {
    const error = asObject(parsed.error);
    throw new Error(asString(error.message) || `${response.status} ${response.statusText}`);
  }
  return parsed as T;
}

/** Fetches BFF health and normalizes upstream connectivity for the UI. */
export async function fetchHealth(): Promise<HealthStatus> {
  const response = await requestJson<JsonObject>("/api/health");
  const bff = asObject(response.bff);
  const agent = asObject(response.agent);
  return {
    ok: response.ok !== false,
    connected: response.ok !== false && agent.ok !== false,
    bffStatus: asString(bff.status) || "unknown",
    agentStatus: asString(agent.status) || (agent.ok === false ? "error" : "ok"),
  };
}

/** Fetches the current session list through the BFF. */
export async function fetchSessions(): Promise<SessionSummary[]> {
  const response = await requestJson<JsonObject>("/api/sessions");
  const sessions = Array.isArray(response.sessions) ? response.sessions : [];
  return sessions.map(normalizeSessionSummary).filter((session) => session.id);
}

/** Creates a new local agent session through the BFF. */
export async function createSession(): Promise<SessionSummary> {
  const response = await requestJson<JsonObject>("/api/sessions", { method: "POST" });
  return normalizeSessionSummary(response.session);
}

/** Fetches one session and its transcript through the BFF. */
export async function fetchSession(sessionId: string): Promise<SessionDetail> {
  const response = await requestJson<JsonObject>(`/api/sessions/${encodeURIComponent(sessionId)}`);
  return normalizeSessionDetail(response.session);
}

/** Sends a user message to a session through the BFF chat endpoint. */
export async function sendSessionMessage(sessionId: string, message: string): Promise<SendMessageResult> {
  const response = await requestJson<JsonObject>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return {
    ok: response.ok !== false,
    assistant: typeof response.assistant === "string" ? response.assistant : undefined,
    session: response.session ? normalizeSessionSummary(response.session) : undefined,
  };
}
