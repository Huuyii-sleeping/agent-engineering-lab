import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readAuditEvents, recordAuditEvent, type AuditCategory } from "../audit/runtime.js";
import type { AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import { readTrackedWorkspaceFindings } from "../security/secret-scanning.js";
import type { AgentHostEvent } from "../host/events.js";
import type { AgentHostEventSubscriber } from "../host/events.js";
import { createAgentBridgeManifest, type AgentBridgeState } from "./bridge.js";
import {
  normalizeAgentRuntimeContext,
  summarizeSession,
  summarizeSessionTranscript,
  type AgentSessionRecord,
} from "./sessions.js";
import { runUserQuery } from "../runtime/query-runtime.js";
import type { NotificationServiceLike, RuntimeCoordinationServiceLike } from "../services/index.js";
import { resolveBoundSkills, toPromptSkillBlocks } from "../skills/loader.js";
import { handleWorkflowHttpRequest } from "../workflows/http-handler.js";
import { WorkflowRuntimeService } from "../workflows/service.js";

export type AgentServiceDeps = AgentAppRuntimeDeps;

type ChatRequest = {
  session_id?: string;
  message?: string;
  agent?: unknown;
  include_scheduled_notifications?: boolean;
};

type ChatCallbacks = {
  onAssistantDelta?: (delta: string) => void | Promise<void>;
};

export type AgentServiceEvent = AgentHostEvent;

export type AgentServiceEventSubscriber = AgentHostEventSubscriber;

type ParsedEventCursor =
  | { ok: true; value: number | null }
  | { ok: false; source: "since_id" | "Last-Event-ID"; raw: string };

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))),
    );
    req.on("error", reject);
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseEventCursor(raw: string | null): number | null | undefined {
  if (raw === null) {
    return null;
  }
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function getHeaderValue(headers: IncomingMessage["headers"], name: string): string | null {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }
  return typeof value === "string" ? value : null;
}

function resolveReplayCursor(url: URL | null, req: IncomingMessage): ParsedEventCursor {
  const queryValue = url?.searchParams.get("since_id") ?? null;
  const parsedQuery = parseEventCursor(queryValue);
  if (parsedQuery === undefined) {
    return { ok: false, source: "since_id", raw: queryValue ?? "" };
  }
  const headerValue = getHeaderValue(req.headers, "last-event-id");
  const parsedHeader = parseEventCursor(headerValue);
  if (parsedHeader === undefined) {
    return { ok: false, source: "Last-Event-ID", raw: headerValue ?? "" };
  }
  return { ok: true, value: parsedHeader ?? parsedQuery };
}

function parseAuditCategory(raw: string | null): AuditCategory | undefined {
  if (raw === "session" || raw === "tool" || raw === "security" || raw === "retention") {
    return raw;
  }
  return undefined;
}

function parseLimit(raw: string | null): number | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function writeSseEvent(
  res: ServerResponse,
  input: { event: string; data: unknown; id?: number },
): void {
  if (typeof input.id === "number") {
    res.write(`id: ${input.id}\n`);
  }
  res.write(`event: ${input.event}\n`);
  res.write(`data: ${JSON.stringify(input.data)}\n\n`);
}

export class AgentService {
  private readonly host: AgentHost;
  private readonly client: AgentServiceDeps["client"];
  private readonly model: AgentServiceDeps["model"];
  private readonly promptSource: AgentServiceDeps["promptSource"];
  private readonly toolService: AgentServiceDeps["toolService"];
  private readonly deliveryService: AgentServiceDeps["deliveryService"];
  private readonly hookService: AgentServiceDeps["hookService"];
  private readonly memoryService: AgentServiceDeps["memoryService"];
  private readonly notificationService: NotificationServiceLike;
  private readonly modelPolicyService: AgentServiceDeps["modelPolicyService"];
  private readonly observabilityService: AgentServiceDeps["observabilityService"];
  private readonly runtimeCoordinationService: RuntimeCoordinationServiceLike;
  private readonly runtimeServices: AgentServiceDeps["runtimeServices"];
  private readonly queryEngine: AgentServiceDeps["queryEngine"];
  /** 工作流执行由 Agent runtime 负责，BFF 只消费此控制面。 */
  readonly workflowRuntime: WorkflowRuntimeService;

  constructor(deps: AgentServiceDeps, host?: AgentHost) {
    this.host = host ?? new AgentHost(deps);
    this.client = deps.client;
    this.model = deps.model;
    this.promptSource = deps.promptSource;
    this.toolService = deps.toolService;
    this.deliveryService = deps.deliveryService;
    this.hookService = deps.hookService;
    this.memoryService = deps.memoryService;
    this.notificationService = deps.notificationService;
    this.modelPolicyService = deps.modelPolicyService;
    this.observabilityService = deps.observabilityService;
    this.runtimeCoordinationService = deps.runtimeCoordinationService;
    this.runtimeServices = deps.runtimeServices;
    this.queryEngine = deps.queryEngine;
    this.workflowRuntime = new WorkflowRuntimeService(deps);
  }

  createSession(agent?: unknown): AgentSessionRecord {
    const record = this.host.createSessionSync(normalizeAgentRuntimeContext(agent));
    void this.host.persistSession(record);
    return record;
  }

  listSessions(): AgentSessionRecord[] {
    return this.host.listSessions();
  }

  getSession(sessionId: string): AgentSessionRecord | null {
    return this.host.getSession(sessionId);
  }

  async toolsMetadata(): Promise<Array<Record<string, string>>> {
    return this.toolService.listToolMetadata();
  }

  async runToolByName(name: string, argumentsJson: string): Promise<string> {
    return this.toolService.runToolByName(name, argumentsJson);
  }

  resolveAgentSkills(input: unknown): Record<string, unknown> {
    const agent = normalizeAgentRuntimeContext(input);
    if (!agent) {
      return {
        ok: false,
        error: {
          code: "INVALID_AGENT_CONTEXT",
          message: "agent context is required",
        },
      };
    }
    const resolvedSkills = resolveBoundSkills(agent);
    if (!resolvedSkills.ok) {
      return {
        ok: false,
        error: {
          code: "AGENT_SKILL_LOAD_FAILED",
          message: "agent skill binding could not be loaded",
          details: resolvedSkills.issues,
        },
        agent,
      };
    }
    return {
      ok: true,
      agent,
      skills: resolvedSkills.skills.map((skill) => ({
        name: skill.name,
        sourceType: skill.sourceType,
        path: skill.path,
        contentLength: skill.contentLength,
      })),
    };
  }

  getSessionDetail(sessionId: string): Record<string, unknown> | null {
    const session = this.getSession(sessionId);
    return session ? summarizeSessionTranscript(session) : null;
  }

  bridgeManifest(): Record<string, unknown> {
    return createAgentBridgeManifest();
  }

  bridgeState(): AgentBridgeState {
    const manifest = createAgentBridgeManifest();
    const sessions = this.listSessions().map((item) => summarizeSession(item));
    const eventWindow = this.host.eventWindow();
    return {
      ok: true,
      ready: true,
      name: manifest.name,
      version: manifest.version,
      capabilities: manifest.capabilities,
      session_count: sessions.length,
      sessions,
      latest_event_id: eventWindow.latestEventId,
      oldest_event_id: eventWindow.oldestEventId,
      buffered_event_count: eventWindow.bufferedEventCount,
    };
  }

  replayEventsSince(cursor: number | null): AgentServiceEvent[] {
    return this.host.listEventsSince(cursor);
  }

  subscribeEvents(subscriber: AgentServiceEventSubscriber): () => void {
    return this.host.subscribeEvents(subscriber);
  }

  async chat(input: ChatRequest, callbacks: ChatCallbacks = {}): Promise<Record<string, unknown>> {
    const prompt = String(input.message ?? "").trim();
    if (!prompt) {
      return {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "message is required",
        },
      };
    }

    const agent = normalizeAgentRuntimeContext(input.agent);
    const session = input.session_id
      ? this.getSession(String(input.session_id))
      : this.createSession(agent);
    if (!session) {
      return {
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: `session not found: ${String(input.session_id)}`,
        },
      };
    }
    if (session.busy) {
      return {
        ok: false,
        error: {
          code: "SESSION_BUSY",
          message: `session is busy: ${session.id}`,
        },
      };
    }
    if (agent) {
      session.agent = agent;
    }
    const promptSource = { ...this.promptSource };
    if (session.agent) {
      const resolvedSkills = resolveBoundSkills(session.agent);
      if (!resolvedSkills.ok) {
        return {
          ok: false,
          error: {
            code: "AGENT_SKILL_LOAD_FAILED",
            message: "agent skill binding could not be loaded",
            details: resolvedSkills.issues,
          },
          session: summarizeSession(session),
        };
      }
      promptSource.skills = toPromptSkillBlocks(resolvedSkills.skills, { sessionId: session.id });
    }

    session.busy = true;
    session.updatedAt = Date.now();
    await recordAuditEvent({
      category: "session",
      action: "chat",
      outcome: "started",
      subject: session.id,
      summary: "chat started",
      sessionId: session.id,
      metadata: {
        messageLength: prompt.length,
        rounds: session.runtimeState.roundCounter,
      },
    });
    this.host.emitEvent("chat.started", {
      session: summarizeSession(session),
      message: prompt,
    });
    try {
      const result = await runUserQuery({
        app: {
          client: this.client,
          model: this.model,
          promptSource,
          toolService: this.toolService,
          deliveryService: this.deliveryService,
          hookService: this.hookService,
          memoryService: this.memoryService,
          notificationService: this.notificationService,
          modelPolicyService: this.modelPolicyService,
          observabilityService: this.observabilityService,
          runtimeCoordinationService: this.runtimeCoordinationService,
          runtimeServices: this.runtimeServices,
          queryEngine: this.queryEngine,
        },
        history: session.history,
        runtimeState: session.runtimeState,
        prompt,
        includeScheduledNotifications: input.include_scheduled_notifications === true,
        onAssistantDelta: callbacks.onAssistantDelta,
      });
      if (!result.ok) {
        await recordAuditEvent({
          category: "session",
          action: "chat",
          outcome: "failed",
          subject: session.id,
          summary: result.error.message,
          sessionId: session.id,
          metadata: {
            errorCode: result.error.code,
            rounds: session.runtimeState.roundCounter,
          },
        });
        this.host.emitEvent("chat.failed", {
          session: summarizeSession(session),
          error: result.error,
        });
        return {
          ok: false,
          error: result.error,
          session: summarizeSession(session),
        };
      }
      session.updatedAt = Date.now();
      await recordAuditEvent({
        category: "session",
        action: "chat",
        outcome: "completed",
        subject: session.id,
        summary: "chat completed",
        sessionId: session.id,
        metadata: {
          messageCount: session.history.length,
          rounds: session.runtimeState.roundCounter,
        },
      });
      this.host.emitEvent("chat.completed", {
        session: summarizeSession(session),
        assistant: result.assistant,
      });
      return {
        ok: true,
        session: summarizeSession(session),
        assistant: result.assistant,
      };
    } finally {
      session.busy = false;
      session.updatedAt = Date.now();
      await this.host.persistSession(session);
    }
  }
}

export function createAgentHttpServer(service: AgentService): Server {
  return createServer(async (req, res) => {
    try {
      const url = req.url ? new URL(req.url, "http://127.0.0.1") : null;
      const pathname = url?.pathname ?? "/";
      const method = req.method ?? "GET";

      if (url && pathname.startsWith("/workflow-runs") && await handleWorkflowHttpRequest(service.workflowRuntime, req, res, url)) {
        return;
      }

      if (method === "GET" && pathname === "/health") {
        json(res, 200, { ok: true, status: "ok" });
        return;
      }
      if (method === "GET" && pathname === "/bridge") {
        json(res, 200, service.bridgeManifest());
        return;
      }
      if (method === "GET" && pathname === "/bridge/state") {
        json(res, 200, service.bridgeState());
        return;
      }
      if (method === "GET" && pathname === "/tools") {
        json(res, 200, { ok: true, tools: await service.toolsMetadata() });
        return;
      }
      if (method === "POST" && pathname === "/skills/resolve") {
        const body = await parseBody<{ agent?: unknown }>(req);
        const result = service.resolveAgentSkills(body.agent);
        json(res, result.ok === false ? 400 : 200, result);
        return;
      }
      if (method === "GET" && pathname === "/audit/events") {
        json(res, 200, {
          ok: true,
          events: await readAuditEvents({
            limit: parseLimit(url?.searchParams.get("limit") ?? null),
            sessionId: url?.searchParams.get("session_id") ?? undefined,
            traceId: url?.searchParams.get("trace_id") ?? undefined,
            category: parseAuditCategory(url?.searchParams.get("category") ?? null),
          }),
        });
        return;
      }
      if (method === "GET" && pathname === "/security/findings") {
        json(res, 200, {
          ok: true,
          findings: await readTrackedWorkspaceFindings(),
        });
        return;
      }
      if (method === "POST" && pathname === "/tools/call") {
        const body = await parseBody<{ name?: string; arguments_json?: string }>(req);
        const toolName = String(body.name ?? "").trim();
        if (!toolName) {
          json(res, 400, {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "tool name is required",
            },
          });
          return;
        }
        const output = await service.runToolByName(toolName, String(body.arguments_json ?? ""));
        json(res, 200, { ok: true, output });
        return;
      }
      if (method === "GET" && pathname === "/events") {
        const cursor = resolveReplayCursor(url, req);
        if (!cursor.ok) {
          json(res, 400, {
            ok: false,
            error: {
              code: "INVALID_CURSOR",
              message: `${cursor.source} must be an integer cursor`,
              value: cursor.raw,
            },
          });
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Connection", "keep-alive");
        writeSseEvent(res, {
          event: "bridge.ready",
          data: {
            ok: true,
            replay_from: cursor.value,
            bridge: service.bridgeState(),
          },
        });
        for (const event of service.replayEventsSince(cursor.value)) {
          writeSseEvent(res, {
            id: event.id,
            event: event.type,
            data: event,
          });
        }
        const unsubscribe = service.subscribeEvents((event) => {
          writeSseEvent(res, {
            id: event.id,
            event: event.type,
            data: event,
          });
        });
        req.on("close", unsubscribe);
        return;
      }
      if (method === "GET" && pathname === "/sessions") {
        json(res, 200, {
          ok: true,
          sessions: service.listSessions().map((item) => summarizeSession(item)),
        });
        return;
      }
      if (method === "POST" && pathname === "/sessions") {
        const body = await parseBody<{ agent?: unknown }>(req);
        const session = service.createSession(body.agent);
        json(res, 201, { ok: true, session: summarizeSession(session) });
        return;
      }
      if (method === "GET" && pathname.startsWith("/sessions/")) {
        const sessionId = decodeURIComponent(pathname.slice("/sessions/".length));
        const session = service.getSessionDetail(sessionId);
        if (!session) {
          json(res, 404, {
            ok: false,
            error: {
              code: "SESSION_NOT_FOUND",
              message: `session not found: ${sessionId}`,
            },
          });
          return;
        }
        json(res, 200, { ok: true, session });
        return;
      }
      if (method === "POST" && pathname === "/chat") {
        const body = await parseBody<ChatRequest>(req);
        const result = await service.chat(body);
        json(res, result.ok === false ? 400 : 200, result);
        return;
      }
      if (method === "POST" && pathname === "/chat/stream") {
        const body = await parseBody<ChatRequest>(req);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();
        writeSseEvent(res, {
          event: "message.start",
          data: { session_id: body.session_id },
        });
        const result = await service.chat(body, {
          onAssistantDelta: async (delta) => {
            if (!res.write(`event: message.delta\ndata: ${JSON.stringify({ delta })}\n\n`)) {
              await new Promise<void>((resolve) => res.once("drain", resolve));
            }
          },
        });
        if (result.ok === false) {
          const error = result.error as { code?: unknown; message?: unknown } | undefined;
          writeSseEvent(res, {
            event: "message.error",
            data: {
              code: String(error?.code ?? "CHAT_STREAM_FAILED"),
              message: String(error?.message ?? "chat stream failed"),
              session: result.session,
            },
          });
          res.end();
          return;
        }
        writeSseEvent(res, {
          event: "message.done",
          data: {
            ok: true,
            assistant: result.assistant,
            session: result.session,
          },
        });
        res.end();
        return;
      }

      json(res, 404, {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `${method} ${pathname} is not implemented`,
        },
      });
    } catch (error) {
      json(res, 500, {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
