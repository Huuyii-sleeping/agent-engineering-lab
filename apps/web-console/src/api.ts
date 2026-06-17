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

/** Local Web Console profile managed by the BFF business API. */
export type UserProfile = {
  displayName: string;
  description: string;
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

export type StreamMessageEvent =
  | { type: "message.start"; data: { session_id?: string } }
  | { type: "message.delta"; data: { delta?: string } }
  | { type: "message.done"; data: SendMessageResult }
  | { type: "message.error"; data: { code?: string; message?: string } };

/** Agent bridge events delivered by the BFF SSE endpoint. */
export type AgentStreamEvent = {
  type: string;
  id: string | null;
  data: unknown;
};

export type AgentEventStream = {
  close(): void;
};

type JsonObject = Record<string, unknown>;
type EventSourceLike = Pick<EventSource, "addEventListener" | "close"> & {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

type EventSourceConstructor = new (url: string) => EventSourceLike;

const agentStreamEventTypes = ["bridge.ready", "session.created", "chat.started", "chat.completed", "chat.failed"];

export const defaultUserProfile: UserProfile = {
  displayName: "本地用户",
  description: "AI Studio operator",
};

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

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const next = value.trim();
  return next ? next : fallback;
}

/** Normalize a user profile before it is displayed in the Web console. */
export function normalizeUserProfile(value: unknown): UserProfile {
  const record = asObject(value);
  return {
    displayName: cleanText(record.displayName, defaultUserProfile.displayName).slice(0, 24),
    description: cleanText(record.description, defaultUserProfile.description).slice(0, 48),
  };
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

function parseEventData(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function parseStreamMessageEvent(type: string, data: unknown): StreamMessageEvent | null {
  const record = asObject(data);
  if (type === "message.start") {
    return { type, data: { session_id: asString(record.session_id) || undefined } };
  }
  if (type === "message.delta") {
    return { type, data: { delta: asString(record.delta) } };
  }
  if (type === "message.done") {
    return {
      type,
      data: {
        ok: record.ok !== false,
        assistant: typeof record.assistant === "string" ? record.assistant : undefined,
        session: record.session ? normalizeSessionSummary(record.session) : undefined,
      },
    };
  }
  if (type === "message.error") {
    return {
      type,
      data: {
        code: asString(record.code) || "CHAT_STREAM_FAILED",
        message: asString(record.message) || "chat stream failed",
      },
    };
  }
  return null;
}

function parseSseBlock(raw: string): { type: string; data: unknown } | null {
  const lines = raw.split(/\r?\n/);
  let type = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      type = line.slice("event:".length).trim();
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return { type, data: parseEventData(dataLines.join("\n")) };
}

async function readSseResponse(
  response: Response,
  onEvent: (event: StreamMessageEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("stream response body is not available");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffered += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const blocks = buffered.split(/\n\n/);
      buffered = blocks.pop() ?? "";
      for (const block of blocks) {
        const parsed = parseSseBlock(block.trim());
        if (!parsed) {
          continue;
        }
        const event = parseStreamMessageEvent(parsed.type, parsed.data);
        if (event) {
          onEvent(event);
        }
      }
      if (done) {
        break;
      }
    }
    const tail = parseSseBlock(buffered.trim());
    if (tail) {
      const event = parseStreamMessageEvent(tail.type, tail.data);
      if (event) {
        onEvent(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Opens the BFF SSE stream and forwards known agent events to the caller. */
export function createAgentEventStream(input: {
  onOpen?: () => void;
  onError?: () => void;
  onEvent: (event: AgentStreamEvent) => void;
  eventSourceCtor?: EventSourceConstructor;
}): AgentEventStream {
  const EventSourceImpl = input.eventSourceCtor ?? globalThis.EventSource;
  if (!EventSourceImpl) {
    throw new Error("EventSource is not available in this browser");
  }
  const source = new EventSourceImpl("/api/events/stream?since_id=-1");
  source.onopen = () => input.onOpen?.();
  source.onerror = () => input.onError?.();
  for (const type of agentStreamEventTypes) {
    source.addEventListener(type, (event) => {
      input.onEvent({
        type,
        id: event.lastEventId || null,
        data: parseEventData(event.data),
      });
    });
  }
  return source;
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

/** Fetches the current local Web profile from the BFF business API. */
export async function fetchProfile(): Promise<UserProfile> {
  const response = await requestJson<JsonObject>("/api/profile");
  return normalizeUserProfile(response.profile);
}

/** Saves the current local Web profile through the BFF business API. */
export async function updateProfile(profile: UserProfile): Promise<UserProfile> {
  const response = await requestJson<JsonObject>("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  return normalizeUserProfile(response.profile);
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

/** Sends a user message and consumes message-level SSE events from the BFF. */
export async function sendSessionMessageStream(
  sessionId: string,
  message: string,
  onEvent: (event: StreamMessageEvent) => void,
): Promise<void> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw.trim() || `${response.status} ${response.statusText}`);
  }
  await readSseResponse(response, onEvent);
}
