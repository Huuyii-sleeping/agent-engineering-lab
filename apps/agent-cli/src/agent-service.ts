import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createAgentRuntimeState, type AgentAppRuntimeDeps } from "./bootstrap/app-runtime.js";
import type { NotificationServiceLike } from "./notification-service.js";
import { runUserQuery } from "./runtime/query-runtime.js";
import type { AgentRuntimeState } from "./runtime/query-types.js";
import type { RuntimeCoordinationServiceLike } from "./runtime-coordination-service.js";

type AgentSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  busy: boolean;
  history: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
};

export type AgentServiceDeps = AgentAppRuntimeDeps;

type ChatRequest = {
  session_id?: string;
  message?: string;
};

function nowMs(): number {
  return Date.now();
}

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

function summarizeSession(session: AgentSessionRecord): Record<string, unknown> {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    busy: session.busy,
    messageCount: session.history.length,
    rounds: session.runtimeState.roundCounter,
  };
}

export class AgentService {
  private readonly sessions = new Map<string, AgentSessionRecord>();
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
  private readonly queryEngine: AgentServiceDeps["queryEngine"];

  constructor(deps: AgentServiceDeps) {
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
    this.queryEngine = deps.queryEngine;
  }

  createSession(): AgentSessionRecord {
    const id = randomUUID();
    const createdAt = nowMs();
    const record: AgentSessionRecord = {
      id,
      createdAt,
      updatedAt: createdAt,
      busy: false,
      history: [],
      runtimeState: createAgentRuntimeState(id),
    };
    this.sessions.set(id, record);
    return record;
  }

  listSessions(): AgentSessionRecord[] {
    return [...this.sessions.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  getSession(sessionId: string): AgentSessionRecord | null {
    return this.sessions.get(sessionId) ?? null;
  }

  async toolsMetadata(): Promise<Array<Record<string, string>>> {
    return this.toolService.listToolMetadata();
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
    session.updatedAt = nowMs();
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
          queryEngine: this.queryEngine,
        },
        history: session.history,
        runtimeState: session.runtimeState,
        prompt,
      });
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          session: summarizeSession(session),
        };
      }
      session.updatedAt = nowMs();
      return {
        ok: true,
        session: summarizeSession(session),
        assistant: result.assistant,
      };
    } finally {
      session.busy = false;
      session.updatedAt = nowMs();
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
      if (method === "GET" && pathname === "/tools") {
        json(res, 200, { ok: true, tools: await service.toolsMetadata() });
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
