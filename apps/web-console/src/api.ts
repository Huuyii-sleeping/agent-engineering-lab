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

/** User-managed agent profile displayed and edited in the Agent management workspace. */
export type AgentProfile = {
  id: string;
  avatarId: string;
  name: string;
  description: string;
  scenario: string;
  skillIds: string[];
  actions: string[];
  systemPrompt: string;
  createdAt: number | null;
  updatedAt: number | null;
};

/** Editable payload accepted by the BFF agent profile APIs. */
export type AgentProfileInput = Pick<
  AgentProfile,
  "avatarId" | "name" | "description" | "scenario" | "skillIds" | "actions" | "systemPrompt"
>;

/** Local skill registry item returned by the BFF Skill Hub APIs. */
export type SkillRegistryItem = {
  id: string;
  name: string;
  description: string;
  summary: string;
  category: string;
  provider: string;
  version: string;
  runtime: string;
  permissions: string[];
  updatedAt: string;
  maturity: "stable" | "beta";
  tags: string[];
  entry: string;
  installed: boolean;
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

export const defaultAgentProfileInput: AgentProfileInput = {
  avatarId: "brain",
  name: "本地研发 Agent",
  description: "面向代码、文档和自动化执行的本地 agent。",
  scenario: "本地研发、资料整理、任务拆解和交付验证。",
  skillIds: ["code-workspace", "memory-context", "quality-gate"],
  actions: ["分析需求", "执行任务", "验证结果"],
  systemPrompt: "你是一个严谨的本地工作台 agent，优先明确目标、执行验证，并给出可复查的结果。",
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

function cleanOptionalText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanStringList(value: unknown, limit: number, itemLimit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, itemLimit))
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

/** Normalize a user profile before it is displayed in the Web console. */
export function normalizeUserProfile(value: unknown): UserProfile {
  const record = asObject(value);
  return {
    displayName: cleanText(record.displayName, defaultUserProfile.displayName).slice(0, 24),
    description: cleanText(record.description, defaultUserProfile.description).slice(0, 48),
  };
}

/** Normalize an agent profile before it is displayed in the Web console. */
export function normalizeAgentProfile(value: unknown): AgentProfile {
  const record = asObject(value);
  return {
    id: cleanText(record.id, "").slice(0, 80),
    avatarId: cleanText(record.avatarId, defaultAgentProfileInput.avatarId).slice(0, 40),
    name: cleanText(record.name, defaultAgentProfileInput.name).slice(0, 36),
    description: cleanOptionalText(record.description, 140) || defaultAgentProfileInput.description,
    scenario: cleanOptionalText(record.scenario, 180) || defaultAgentProfileInput.scenario,
    skillIds: cleanStringList(record.skillIds, 24, 80),
    actions: cleanStringList(record.actions, 24, 80),
    systemPrompt: cleanOptionalText(record.systemPrompt, 1600) || defaultAgentProfileInput.systemPrompt,
    createdAt: asNumber(record.createdAt),
    updatedAt: asNumber(record.updatedAt),
  };
}

/** Normalize editable agent profile input before sending it to the BFF. */
export function normalizeAgentProfileInput(value: unknown): AgentProfileInput {
  const agent = normalizeAgentProfile(value);
  return {
    avatarId: agent.avatarId,
    name: agent.name,
    description: agent.description,
    scenario: agent.scenario,
    skillIds: agent.skillIds,
    actions: agent.actions,
    systemPrompt: agent.systemPrompt,
  };
}

/** Normalize a Skill Hub registry item before it is displayed in the Web console. */
export function normalizeSkillRegistryItem(value: unknown): SkillRegistryItem {
  const record = asObject(value);
  const id = cleanText(record.id, "").slice(0, 80);
  return {
    id,
    name: cleanText(record.name, id || "未命名 Skill").slice(0, 80),
    description: cleanOptionalText(record.description, 1200),
    summary: cleanOptionalText(record.summary, 220) || "暂无简介",
    category: cleanText(record.category, "未分类").slice(0, 40),
    provider: cleanText(record.provider, "Local").slice(0, 80),
    version: cleanText(record.version, "0.0.0").slice(0, 40),
    runtime: cleanText(record.runtime, "Local runtime").slice(0, 80),
    permissions: cleanStringList(record.permissions, 16, 40),
    updatedAt: cleanOptionalText(record.updatedAt, 32),
    maturity: record.maturity === "beta" ? "beta" : "stable",
    tags: cleanStringList(record.tags, 16, 40),
    entry: cleanText(record.entry, "README.md").slice(0, 120),
    installed: asBoolean(record.installed),
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

/** Fetches locally persisted agent profiles through the BFF business API. */
export async function fetchAgents(): Promise<AgentProfile[]> {
  const response = await requestJson<JsonObject>("/api/agents");
  const agents = Array.isArray(response.agents) ? response.agents : [];
  return agents.map(normalizeAgentProfile).filter((agent) => agent.id);
}

/** Creates a locally persisted agent profile through the BFF business API. */
export async function createAgentProfile(input: Partial<AgentProfileInput> = {}): Promise<AgentProfile> {
  const response = await requestJson<JsonObject>("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeAgentProfileInput({ ...defaultAgentProfileInput, ...input })),
  });
  return normalizeAgentProfile(response.agent);
}

/** Updates a locally persisted agent profile through the BFF business API. */
export async function updateAgentProfile(agentId: string, input: AgentProfileInput): Promise<AgentProfile> {
  const response = await requestJson<JsonObject>(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeAgentProfileInput(input)),
  });
  return normalizeAgentProfile(response.agent);
}

/** Deletes a locally persisted agent profile through the BFF business API. */
export async function deleteAgentProfile(agentId: string): Promise<void> {
  await requestJson<JsonObject>(`/api/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
}

/** Fetches local skill registry items through the BFF business API. */
export async function fetchSkills(): Promise<SkillRegistryItem[]> {
  const response = await requestJson<JsonObject>("/api/skills");
  const skills = Array.isArray(response.skills) ? response.skills : [];
  return skills.map(normalizeSkillRegistryItem).filter((skill) => skill.id);
}

/** Installs one local skill through the BFF business API. */
export async function installSkill(skillId: string): Promise<SkillRegistryItem> {
  const response = await requestJson<JsonObject>(`/api/skills/${encodeURIComponent(skillId)}/install`, {
    method: "POST",
  });
  return normalizeSkillRegistryItem(response.skill);
}

/** Uninstalls one local skill through the BFF business API. */
export async function uninstallSkill(skillId: string): Promise<SkillRegistryItem> {
  const response = await requestJson<JsonObject>(`/api/skills/${encodeURIComponent(skillId)}/uninstall`, {
    method: "POST",
  });
  return normalizeSkillRegistryItem(response.skill);
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
