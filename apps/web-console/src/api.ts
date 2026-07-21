import { isWorkflowDraft, normalizeWorkflowDraft, type WorkflowDiagnostic, type WorkflowDraft, type WorkflowVersion } from "@orbit/workflow-core";

/** Dev-only mock data for the Skill Hub view (no live BFF needed). */
import { mockSkills, mockSkillAuditEvents } from "./mockSkillHub";

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
  agent: AgentRuntimeContext | null;
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

/** BFF 返回的不可变 SOP 版本摘要。 */
export type SopVersionSummary = Omit<WorkflowVersion, "nodes" | "edges"> & { nodeCount: number; edgeCount: number };

/** SOP 导入预检结果。 */
export type SopImportPreview = {
  draft: WorkflowDraft;
  diagnostics: WorkflowDiagnostic[];
  migrated: boolean;
  publishable: boolean;
};

/** BFF API 错误，保留状态码、领域错误码和冲突元数据。 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly metadata: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Local Web Console profile managed by the BFF business API. */
export type UserProfile = {
  displayName: string;
  description: string;
};

/** Where a skill entered the local Skill Hub from. */
export type SkillSourceType = "builtin" | "remote" | "custom";

/** Trust channel claimed by a registry entry or assigned by the local hub. */
export type SkillRegistrySource = "official" | "verified" | "community" | "private" | "local";

/** Version-locked skill binding stored by an Agent profile. */
export type AgentSkillBinding = {
  skillId: string;
  version: string;
  sourceType: SkillSourceType;
  registrySource: SkillRegistrySource;
};

/** Minimal Agent context passed into the runtime session APIs. */
export type AgentRuntimeContext = {
  id: string;
  name: string;
  skills: AgentSkillBinding[];
};

export type AgentResolvedSkillSummary = {
  name: string;
  sourceType: SkillSourceType;
  path: string;
  contentLength: number;
};

export type AgentSkillPreflightIssue = {
  skillId: string;
  version: string;
  sourceType: SkillSourceType;
  code: string;
  message: string;
};

export type AgentSkillPreflightResult =
  | {
      ok: true;
      agent: AgentRuntimeContext | null;
      skills: AgentResolvedSkillSummary[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      agent: AgentRuntimeContext | null;
      issues: AgentSkillPreflightIssue[];
    };

/** User-managed agent profile displayed and edited in the Agent management workspace. */
export type AgentProfile = {
  id: string;
  avatarId: string;
  name: string;
  description: string;
  scenario: string;
  skillIds: string[];
  skills: AgentSkillBinding[];
  actions: string[];
  systemPrompt: string;
  /** Optional user-picked accent color as a `#rrggbb` hex string; empty means auto (hash-based). */
  color: string;
  createdAt: number | null;
  updatedAt: number | null;
};

/** Editable payload accepted by the BFF agent profile APIs. */
export type AgentProfileInput = Pick<
  AgentProfile,
  "avatarId" | "name" | "description" | "scenario" | "skillIds" | "skills" | "actions" | "systemPrompt" | "color"
>;

/** Local skill registry item returned by the BFF Skill Hub APIs. */
export type SkillStatus = "available" | "downloaded" | "installed" | "updateAvailable" | "invalid";

export type SkillPublisher = {
  id: string;
  name: string;
  verified: boolean;
};

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
  sourceType: SkillSourceType;
  registrySource: SkillRegistrySource;
  publisher: SkillPublisher;
  downloads: number;
  rating: number | null;
  packageSha256: string;
  deprecated: boolean;
  status: SkillStatus;
  installed: boolean;
  installedVersion: string;
  installedAt: number | null;
  availableVersion: string;
  previousInstalledVersion: string;
  validationErrors: string[];
  /** Installable versions offered at install time (e.g. a version picker). */
  versions: string[];
};

export type SkillAuditAction = "download" | "upload" | "install" | "update" | "rollback" | "uninstall";

export type SkillAuditEvent = {
  id: string;
  action: SkillAuditAction;
  ok: boolean;
  code: string;
  message: string;
  skillId: string;
  skillName: string;
  version: string;
  status: SkillStatus;
  at: number;
};

/** JSON package accepted by the custom Skill Hub upload API. */
export type SkillPackageInput = {
  skillPackageVersion?: "1.0";
  files: Array<{ path: string; content: string }>;
};

/** Remote Skill Registry connection settings returned by BFF. */
export type RemoteRegistrySettings = {
  url: string;
  managedByService: boolean;
  lastSyncedAt: number | null;
  lastSyncError: string;
  skillCount: number;
};

export type SkillHubReadiness = {
  status: "ready" | "degraded" | "blocked";
  registry: RemoteRegistrySettings;
  store: {
    readable: boolean;
    message: string;
  };
  counts: {
    total: number;
    installed: number;
    updateAvailable: number;
    invalid: number;
    failedAudit: number;
  };
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
  description: "Orbit operator",
};

export const defaultAgentProfileInput: AgentProfileInput = {
  avatarId: "brain",
  name: "本地研发 Agent",
  description: "面向代码、文档和自动化执行的本地 agent。",
  scenario: "本地研发、资料整理、任务拆解和交付验证。",
  skillIds: ["code-workspace", "memory-context", "quality-gate"],
  skills: [
    { skillId: "code-workspace", version: "", sourceType: "builtin", registrySource: "local" },
    { skillId: "memory-context", version: "", sourceType: "builtin", registrySource: "local" },
    { skillId: "quality-gate", version: "", sourceType: "builtin", registrySource: "local" },
  ],
  actions: ["分析需求", "执行任务", "验证结果"],
  systemPrompt: "你是一个严谨的本地工作台 agent，优先明确目标、执行验证，并给出可复查的结果。",
  color: "",
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

/** Normalizes an accent color to a lowercase `#rrggbb` hex string, or "" (auto) when invalid. */
function cleanColor(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const next = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(next) ? next : "";
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

function cleanNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRegistrySource(value: unknown, sourceType: SkillSourceType): SkillRegistrySource {
  if (value === "official" || value === "verified" || value === "community" || value === "private" || value === "local") {
    return value;
  }
  return sourceType === "remote" ? "community" : "local";
}

function normalizePublisher(value: unknown, fallback: string): SkillPublisher {
  const record = asObject(value);
  const id = cleanText(record.id, fallback || "unknown").slice(0, 80);
  return {
    id,
    name: cleanText(record.name, id).slice(0, 120),
    verified: record.verified === true,
  };
}

function normalizeSourceType(value: unknown): SkillSourceType {
  return value === "remote" || value === "custom" || value === "builtin" ? value : "builtin";
}

function legacyAgentSkillBinding(skillId: string): AgentSkillBinding {
  return {
    skillId,
    version: "",
    sourceType: "builtin",
    registrySource: "local",
  };
}

function normalizeAgentSkillBindings(value: unknown, legacySkillIds: string[]): AgentSkillBinding[] {
  if (!Array.isArray(value)) {
    return legacySkillIds.map(legacyAgentSkillBinding);
  }
  const byId = new Map<string, AgentSkillBinding>();
  for (const item of value) {
    const record = asObject(item);
    const skillId = cleanOptionalText(record.skillId, 80);
    if (!skillId) {
      continue;
    }
    const sourceType = normalizeSourceType(record.sourceType);
    byId.set(skillId, {
      skillId,
      version: cleanOptionalText(record.version, 40),
      sourceType,
      registrySource: normalizeRegistrySource(record.registrySource, sourceType),
    });
  }
  const bindings = [...byId.values()].slice(0, 24);
  return bindings.length ? bindings : legacySkillIds.map(legacyAgentSkillBinding);
}

function normalizeAgentRuntimeContext(value: unknown): AgentRuntimeContext | null {
  const record = asObject(value);
  const id = cleanOptionalText(record.id, 80);
  if (!id) {
    return null;
  }
  const legacySkillIds = cleanStringList(record.skillIds, 24, 80);
  return {
    id,
    name: cleanText(record.name, "Agent").slice(0, 36),
    skills: normalizeAgentSkillBindings(record.skills, legacySkillIds),
  };
}

function normalizeResolvedSkillSummary(value: unknown): AgentResolvedSkillSummary {
  const record = asObject(value);
  return {
    name: cleanText(record.name, "未命名 Skill").slice(0, 80),
    sourceType: normalizeSourceType(record.sourceType),
    path: cleanOptionalText(record.path, 600),
    contentLength: Math.max(0, Math.floor(cleanNumber(record.contentLength, 0))),
  };
}

function normalizePreflightIssue(value: unknown): AgentSkillPreflightIssue {
  const record = asObject(value);
  return {
    skillId: cleanOptionalText(record.skillId, 80),
    version: cleanOptionalText(record.version, 40),
    sourceType: normalizeSourceType(record.sourceType),
    code: cleanText(record.code, "SKILL_PRECHECK_FAILED").slice(0, 80),
    message: cleanText(record.message, "Skill runtime check failed.").slice(0, 240),
  };
}

function normalizeAgentSkillPreflightResult(value: unknown): AgentSkillPreflightResult {
  const record = asObject(value);
  const agent = normalizeAgentRuntimeContext(record.agent);
  if (record.ok !== false) {
    const skills = Array.isArray(record.skills) ? record.skills : [];
    return {
      ok: true,
      agent,
      skills: skills.map(normalizeResolvedSkillSummary),
    };
  }
  const error = asObject(record.error);
  const details = Array.isArray(error.details) ? error.details : [];
  return {
    ok: false,
    code: cleanText(error.code, "AGENT_SKILL_PREFLIGHT_FAILED").slice(0, 80),
    message: cleanText(error.message, "Agent skill runtime check failed.").slice(0, 240),
    agent,
    issues: details.map(normalizePreflightIssue).filter((issue) => issue.skillId),
  };
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
  const legacySkillIds = cleanStringList(record.skillIds, 24, 80);
  const skills = normalizeAgentSkillBindings(record.skills, legacySkillIds);
  return {
    id: cleanText(record.id, "").slice(0, 80),
    avatarId: cleanText(record.avatarId, defaultAgentProfileInput.avatarId).slice(0, 40),
    name: cleanText(record.name, defaultAgentProfileInput.name).slice(0, 36),
    description: cleanOptionalText(record.description, 140) || defaultAgentProfileInput.description,
    scenario: cleanOptionalText(record.scenario, 180) || defaultAgentProfileInput.scenario,
    skillIds: skills.map((skill) => skill.skillId),
    skills,
    actions: cleanStringList(record.actions, 24, 80),
    systemPrompt: cleanOptionalText(record.systemPrompt, 1600) || defaultAgentProfileInput.systemPrompt,
    color: cleanColor(record.color),
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
    skills: agent.skills,
    actions: agent.actions,
    systemPrompt: agent.systemPrompt,
    color: agent.color,
  };
}

/** Normalize a Skill Hub registry item before it is displayed in the Web console. */
export function normalizeSkillRegistryItem(value: unknown): SkillRegistryItem {
  const record = asObject(value);
  const id = cleanText(record.id, "").slice(0, 80);
  const sourceType: SkillSourceType =
    record.sourceType === "remote" || record.sourceType === "custom" || record.sourceType === "builtin"
      ? record.sourceType
      : "builtin";
  const rating = cleanNumber(record.rating, Number.NaN);
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
    entry: cleanText(record.entry, "SKILL.md").slice(0, 120),
    sourceType,
    registrySource: normalizeRegistrySource(record.registrySource, sourceType),
    publisher: normalizePublisher(record.publisher, cleanText(record.provider, "Local")),
    downloads: Math.max(0, Math.floor(cleanNumber(record.downloads, 0))),
    rating: Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : null,
    packageSha256: cleanOptionalText(record.packageSha256, 128),
    deprecated: record.deprecated === true,
    status:
      record.status === "available" ||
      record.status === "downloaded" ||
      record.status === "installed" ||
      record.status === "updateAvailable" ||
      record.status === "invalid"
        ? record.status
        : asBoolean(record.installed)
          ? "installed"
          : "downloaded",
    installed: asBoolean(record.installed),
    installedVersion: cleanOptionalText(record.installedVersion, 40),
    installedAt: typeof record.installedAt === "number" && Number.isFinite(record.installedAt) ? record.installedAt : null,
    availableVersion: cleanOptionalText(record.availableVersion, 40),
    previousInstalledVersion: cleanOptionalText(record.previousInstalledVersion, 40),
    validationErrors: cleanStringList(record.validationErrors, 12, 180),
    versions:
      Array.isArray(record.versions) && record.versions.length > 0
        ? record.versions.map((v) => cleanOptionalText(v, 40)).filter(Boolean).slice(0, 16)
        : [cleanText(record.version, "0.0.0")],
  };
}

function normalizeSkillAuditAction(value: unknown): SkillAuditAction {
  return value === "download" ||
    value === "upload" ||
    value === "install" ||
    value === "update" ||
    value === "rollback" ||
    value === "uninstall"
    ? value
    : "install";
}

function normalizeSkillStatus(value: unknown): SkillStatus {
  return value === "available" ||
    value === "downloaded" ||
    value === "installed" ||
    value === "updateAvailable" ||
    value === "invalid"
    ? value
    : "downloaded";
}

/** Normalize a Skill lifecycle audit event before it is displayed in Skill Hub. */
export function normalizeSkillAuditEvent(value: unknown): SkillAuditEvent {
  const record = asObject(value);
  const skillId = cleanText(record.skillId, "").slice(0, 80);
  return {
    id: cleanText(record.id, `${asNumber(record.at) ?? 0}-${skillId}`).slice(0, 140),
    action: normalizeSkillAuditAction(record.action),
    ok: record.ok !== false,
    code: cleanOptionalText(record.code, 80),
    message: cleanOptionalText(record.message, 240),
    skillId,
    skillName: cleanText(record.skillName, skillId || "未命名 Skill").slice(0, 120),
    version: cleanOptionalText(record.version, 40),
    status: normalizeSkillStatus(record.status),
    at: asNumber(record.at) ?? 0,
  };
}

/** Normalize remote registry settings before displaying them in Skill Hub. */
export function normalizeRemoteRegistrySettings(value: unknown): RemoteRegistrySettings {
  const record = asObject(value);
  return {
    url: cleanOptionalText(record.url, 400),
    managedByService: asBoolean(record.managedByService),
    lastSyncedAt: asNumber(record.lastSyncedAt),
    lastSyncError: cleanOptionalText(record.lastSyncError, 400),
    skillCount: Number(record.skillCount ?? 0),
  };
}

export function normalizeSkillHubReadiness(value: unknown): SkillHubReadiness {
  const record = asObject(value);
  const store = asObject(record.store);
  const counts = asObject(record.counts);
  const status = record.status === "blocked" || record.status === "degraded" || record.status === "ready" ? record.status : "blocked";
  return {
    status,
    registry: normalizeRemoteRegistrySettings(record.registry),
    store: {
      readable: asBoolean(store.readable),
      message: cleanOptionalText(store.message, 240),
    },
    counts: {
      total: Math.max(0, Math.floor(cleanNumber(counts.total, 0))),
      installed: Math.max(0, Math.floor(cleanNumber(counts.installed, 0))),
      updateAvailable: Math.max(0, Math.floor(cleanNumber(counts.updateAvailable, 0))),
      invalid: Math.max(0, Math.floor(cleanNumber(counts.invalid, 0))),
      failedAudit: Math.max(0, Math.floor(cleanNumber(counts.failedAudit, 0))),
    },
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
    agent: normalizeAgentRuntimeContext(record.agent),
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
    const { code, message, ...metadata } = error;
    throw new ApiRequestError(
      asString(message) || `${response.status} ${response.statusText}`,
      response.status,
      asString(code) || "API_REQUEST_FAILED",
      metadata,
    );
  }
  return parsed as T;
}

function workflowDraft(value: unknown): WorkflowDraft {
  if (!isWorkflowDraft(value)) throw new Error("BFF 返回了无效的 workflow v2 草稿。 ");
  return normalizeWorkflowDraft(value);
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** 读取服务端权威 SOP 草稿列表。 */
export async function fetchSopDrafts(): Promise<WorkflowDraft[]> {
  const response = await requestJson<{ data?: unknown }>("/api/sops");
  return Array.isArray(response.data) ? response.data.map(workflowDraft) : [];
}

/** 读取一份服务端 SOP 草稿。 */
export async function fetchSopDraft(id: string): Promise<WorkflowDraft> {
  const response = await requestJson<{ data?: unknown }>(`/api/sops/${encodeURIComponent(id)}`);
  return workflowDraft(response.data);
}

/** 在服务端创建 SOP 草稿。 */
export async function createSopDraftRemote(draft: WorkflowDraft): Promise<WorkflowDraft> {
  const response = await requestJson<{ data?: unknown }>("/api/sops", jsonRequest("POST", { draft }));
  return workflowDraft(response.data);
}

/** 使用 expectedRevision 显式保存 SOP 草稿。 */
export async function saveSopDraftRemote(id: string, expectedRevision: number, draft: WorkflowDraft): Promise<WorkflowDraft> {
  const response = await requestJson<{ data?: unknown }>(`/api/sops/${encodeURIComponent(id)}`, jsonRequest("PUT", { expectedRevision, draft }));
  return workflowDraft(response.data);
}

/** 使用 expectedRevision 自动保存 SOP 草稿。 */
export async function autoSaveSopDraft(id: string, expectedRevision: number, draft: WorkflowDraft): Promise<WorkflowDraft> {
  const response = await requestJson<{ data?: unknown }>(`/api/sops/${encodeURIComponent(id)}/autosave`, jsonRequest("POST", { expectedRevision, draft }));
  return workflowDraft(response.data);
}

/** 删除指定 revision 的服务端 SOP 草稿。 */
export async function deleteSopDraftRemote(id: string, revision: number): Promise<void> {
  await requestJson(`/api/sops/${encodeURIComponent(id)}?revision=${revision}`, { method: "DELETE" });
}

/** 发布当前 revision 为不可变版本。 */
export async function publishSopDraft(id: string, expectedRevision: number, releaseNotes = ""): Promise<WorkflowVersion> {
  const response = await requestJson<{ data: WorkflowVersion }>(`/api/sops/${encodeURIComponent(id)}/publish`, jsonRequest("POST", { expectedRevision, releaseNotes }));
  return response.data;
}

/** 读取 SOP 不可变版本摘要。 */
export async function fetchSopVersions(id: string): Promise<SopVersionSummary[]> {
  const response = await requestJson<{ data?: SopVersionSummary[] }>(`/api/sops/${encodeURIComponent(id)}/versions`);
  return Array.isArray(response.data) ? response.data : [];
}

/** 从历史版本创建一份独立草稿。 */
export async function createDraftFromSopVersion(id: string, versionId: string): Promise<WorkflowDraft> {
  const response = await requestJson<{ data?: unknown }>(`/api/sops/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/drafts`, { method: "POST" });
  return workflowDraft(response.data);
}

/** 预检 workflow v2 或旧 v1 导入数据。 */
export async function previewSopImport(draft: unknown): Promise<SopImportPreview> {
  const response = await requestJson<{ data: SopImportPreview }>("/api/sops/import/preview", jsonRequest("POST", { draft }));
  return { ...response.data, draft: workflowDraft(response.data.draft) };
}

/** 将 workflow v2 或旧 v1 数据导入服务端。 */
export async function importSopDraft(draft: unknown): Promise<WorkflowDraft> {
  const response = await requestJson<{ data?: unknown }>("/api/sops/import", jsonRequest("POST", { draft }));
  return workflowDraft(response.data);
}

/** 从服务端权威数据源导出 workflow v2 草稿。 */
export async function exportSopDraft(id: string): Promise<WorkflowDraft> {
  const response = await requestJson<{ data?: unknown }>(`/api/sops/${encodeURIComponent(id)}/export`);
  return workflowDraft(response.data);
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
  const inputRecord = asObject(input);
  const mergedInput: Partial<AgentProfileInput> = { ...defaultAgentProfileInput, ...input };
  if (Array.isArray(inputRecord.skillIds) && !Array.isArray(inputRecord.skills)) {
    delete mergedInput.skills;
  }
  const response = await requestJson<JsonObject>("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeAgentProfileInput(mergedInput)),
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

/** Checks whether an Agent profile's version-bound skills can be loaded by the runtime. */
export async function resolveAgentSkills(agent: AgentRuntimeContext): Promise<AgentSkillPreflightResult> {
  const response = await fetch("/api/agent-skills/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent }),
  });
  const raw = await response.text();
  const parsed = raw.trim() ? (JSON.parse(raw) as JsonObject) : {};
  return normalizeAgentSkillPreflightResult(parsed);
}

/** Fetches local skill registry items through the BFF business API. */
export async function fetchSkills(): Promise<SkillRegistryItem[]> {
  if (process.env.NODE_ENV !== "production") {
    // Dev preview: show mock skills so the Skill Hub layout can be reviewed without a live BFF.
    return mockSkills.map(normalizeSkillRegistryItem).filter((skill) => skill.id);
  }
  const response = await requestJson<JsonObject>("/api/skills");
  const skills = Array.isArray(response.skills) ? response.skills : [];
  return skills.map(normalizeSkillRegistryItem).filter((skill) => skill.id);
}

/** Fetches recent Skill lifecycle audit events through the BFF business API. */
export async function fetchSkillAuditEvents(): Promise<SkillAuditEvent[]> {
  if (process.env.NODE_ENV !== "production") {
    return mockSkillAuditEvents.map(normalizeSkillAuditEvent).filter((event) => event.skillId);
  }
  const response = await requestJson<JsonObject>("/api/skills/audit");
  const events = Array.isArray(response.events) ? response.events : [];
  return events.map(normalizeSkillAuditEvent).filter((event) => event.skillId);
}

/** Fetches the configured remote skill registry connection. */
export async function fetchSkillRegistrySettings(): Promise<RemoteRegistrySettings> {
  const response = await requestJson<JsonObject>("/api/skills/registry");
  return normalizeRemoteRegistrySettings(response.registry);
}

/** Synchronizes the configured remote skill registry index. */
export async function syncSkillRegistry(): Promise<RemoteRegistrySettings> {
  const response = await requestJson<JsonObject>("/api/skills/registry/sync", { method: "POST" });
  return normalizeRemoteRegistrySettings(response.registry);
}

/** Fetches BFF-computed SkillHub production readiness. */
export async function fetchSkillHubReadiness(): Promise<SkillHubReadiness> {
  const response = await requestJson<JsonObject>("/api/skills/readiness");
  return normalizeSkillHubReadiness(response.readiness);
}

/** Installs one local skill through the BFF business API. */
export async function installSkill(skillId: string): Promise<SkillRegistryItem> {
  const response = await requestJson<JsonObject>(`/api/skills/${encodeURIComponent(skillId)}/install`, {
    method: "POST",
  });
  return normalizeSkillRegistryItem(response.skill);
}

/** Updates one installed skill to the newest available version through the BFF business API. */
export async function updateSkill(skillId: string): Promise<SkillRegistryItem> {
  const response = await requestJson<JsonObject>(`/api/skills/${encodeURIComponent(skillId)}/update`, {
    method: "POST",
  });
  return normalizeSkillRegistryItem(response.skill);
}

/** Rolls one installed skill back to the previous local version through the BFF business API. */
export async function rollbackSkill(skillId: string): Promise<SkillRegistryItem> {
  const response = await requestJson<JsonObject>(`/api/skills/${encodeURIComponent(skillId)}/rollback`, {
    method: "POST",
  });
  return normalizeSkillRegistryItem(response.skill);
}

/** Downloads one remote skill through the BFF business API. */
export async function downloadSkill(skillId: string): Promise<SkillRegistryItem> {
  const response = await requestJson<JsonObject>(`/api/skills/${encodeURIComponent(skillId)}/download`, {
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

/** Uploads a custom skill package through the BFF business API. */
export async function uploadSkillPackage(input: SkillPackageInput): Promise<SkillRegistryItem> {
  const response = await requestJson<JsonObject>("/api/skills/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
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
export async function createSession(agent?: AgentRuntimeContext | null): Promise<SessionSummary> {
  const response = await requestJson<JsonObject>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: agent ?? null }),
  });
  return normalizeSessionSummary(response.session);
}

/** Fetches one session and its transcript through the BFF. */
export async function fetchSession(sessionId: string): Promise<SessionDetail> {
  const response = await requestJson<JsonObject>(`/api/sessions/${encodeURIComponent(sessionId)}`);
  return normalizeSessionDetail(response.session);
}

/** Sends a user message to a session through the BFF chat endpoint. */
export async function sendSessionMessage(
  sessionId: string,
  message: string,
  agent?: AgentRuntimeContext | null,
): Promise<SendMessageResult> {
  const response = await requestJson<JsonObject>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, agent: agent ?? null }),
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
  agent?: AgentRuntimeContext | null,
): Promise<void> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ message, agent: agent ?? null }),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw.trim() || `${response.status} ${response.statusText}`);
  }
  await readSseResponse(response, onEvent);
}
