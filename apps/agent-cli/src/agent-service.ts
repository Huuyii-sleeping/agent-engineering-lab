import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { agentLoop, type AgentRuntimeState } from "./agent-loop.js";
import { createClient, getDefaultModel, getStaticPromptSource } from "./config.js";
import { runHooks } from "./hooks/index.js";
import type { StaticPromptSource } from "./prompt/types.js";
import { withCompactRuntimeContext } from "./tools/base.js";
import { listTools } from "./tools/index.js";

type AgentSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  busy: boolean;
  history: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
};

type AgentServiceDeps = {
  client?: OpenAI;
  model?: string;
  promptSource?: StaticPromptSource;
  tools?: ChatCompletionTool[];
  toolsResolver?: () => Promise<ChatCompletionTool[]>;
  loopRunner?: typeof agentLoop;
};

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
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
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

function createRuntimeState(sessionId: string): AgentRuntimeState {
  return {
    sessionId,
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
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

function listToolMetadata(tools: ChatCompletionTool[]): Array<Record<string, string>> {
  return tools
    .filter((tool): tool is Extract<ChatCompletionTool, { type: "function" }> => tool.type === "function")
    .map((tool) => ({
      name: tool.function.name,
      description: tool.function.description ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export class AgentService {
  private readonly sessions = new Map<string, AgentSessionRecord>();
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly promptSource: StaticPromptSource;
  private readonly toolsResolver: () => Promise<ChatCompletionTool[]>;
  private readonly loopRunner: typeof agentLoop;

  constructor(deps: AgentServiceDeps = {}) {
    this.client = deps.client ?? createClient();
    this.model = deps.model ?? getDefaultModel();
    this.promptSource = deps.promptSource ?? getStaticPromptSource();
    this.toolsResolver = deps.toolsResolver ?? (deps.tools ? async () => deps.tools ?? [] : listTools);
    this.loopRunner = deps.loopRunner ?? agentLoop;
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
      runtimeState: createRuntimeState(id),
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
    return listToolMetadata(await this.toolsResolver());
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

    const session = input.session_id ? this.getSession(String(input.session_id)) : this.createSession();
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
      const promptHooks = await runHooks("UserPromptSubmit", {
        session_id: session.runtimeState.sessionId,
        payload: { prompt },
      });
      if (promptHooks.blocked) {
        return {
          ok: false,
          error: {
            code: "HOOK_BLOCKED",
            message: promptHooks.blockReason ?? "prompt blocked by hook",
          },
          session: summarizeSession(session),
        };
      }

      for (const item of promptHooks.messages) {
        const content = item.trim();
        if (content) {
          session.history.push({ role: "system", content });
        }
      }
      session.history.push({ role: "user", content: prompt });
      const tools = await this.toolsResolver();

      await withCompactRuntimeContext({ messages: session.history }, async () =>
        this.loopRunner({
          client: this.client,
          model: this.model,
          promptSource: this.promptSource,
          tools,
          messages: session.history,
          runtimeState: session.runtimeState,
        }),
      );

      const lastMessage = [...session.history].reverse().find((item) => item.role === "assistant");
      session.updatedAt = nowMs();
      return {
        ok: true,
        session: summarizeSession(session),
        assistant:
          lastMessage?.role === "assistant" && typeof lastMessage.content === "string" ? lastMessage.content : "",
      };
    } finally {
      session.busy = false;
      session.updatedAt = nowMs();
    }
  }
}

export function createAgentHttpServer(service = new AgentService()): Server {
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
        json(res, 200, { ok: true, sessions: service.listSessions().map((item) => summarizeSession(item)) });
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
