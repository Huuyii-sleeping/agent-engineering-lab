import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import type { AgentHostEvent } from "../host/events.js";
import type { AgentHostEventSubscriber } from "../host/events.js";
import {
  summarizeSession,
  summarizeSessionTranscript,
  type AgentSessionRecord,
} from "./sessions.js";
import { runUserQuery } from "../runtime/query-runtime.js";
import type { NotificationServiceLike, RuntimeCoordinationServiceLike } from "../services/index.js";

export type AgentServiceDeps = AgentAppRuntimeDeps;

type ChatRequest = {
  session_id?: string;
  message?: string;
};

export type AgentServiceEvent = AgentHostEvent;

export type AgentServiceEventSubscriber = AgentHostEventSubscriber;

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
  }

  createSession(): AgentSessionRecord {
    const record = this.host.createSessionSync();
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

  getSessionDetail(sessionId: string): Record<string, unknown> | null {
    const session = this.getSession(sessionId);
    return session ? summarizeSessionTranscript(session) : null;
  }

  bridgeManifest(): Record<string, unknown> {
    return {
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
    };
  }

  subscribeEvents(subscriber: AgentServiceEventSubscriber): () => void {
    return this.host.subscribeEvents(subscriber);
  }

  async chat(input: ChatRequest): Promise<Record<string, unknown>> {
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

    const session = input.session_id
      ? this.getSession(String(input.session_id))
      : this.createSession();
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

    session.busy = true;
    session.updatedAt = Date.now();
    this.host.emitEvent("chat.started", {
      session: summarizeSession(session),
      message: prompt,
    });
    try {
      const result = await runUserQuery({
        app: {
          client: this.client,
          model: this.model,
          promptSource: this.promptSource,
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
      });
      if (!result.ok) {
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

      if (method === "GET" && pathname === "/health") {
        json(res, 200, { ok: true, status: "ok" });
        return;
      }
      if (method === "GET" && pathname === "/bridge") {
        json(res, 200, service.bridgeManifest());
        return;
      }
      if (method === "GET" && pathname === "/tools") {
        json(res, 200, { ok: true, tools: await service.toolsMetadata() });
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
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Connection", "keep-alive");
        res.write("event: bridge.ready\n");
        res.write(`data: ${JSON.stringify({ ok: true })}\n\n`);
        const unsubscribe = service.subscribeEvents((event) => {
          res.write(`id: ${event.id}\n`);
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
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
        const session = service.createSession();
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
