import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

type JsonObject = Record<string, unknown>;

export type BffServerOptions = {
  agentBaseUrl: string;
  fetchImpl?: typeof fetch;
};

type ProxyResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: JsonObject };

function applyCommonHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Last-Event-ID");
  res.setHeader("Cache-Control", "no-store");
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  applyCommonHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function errorPayload(
  code: string,
  message: string,
  metadata: JsonObject = {},
): JsonObject {
  return {
    ok: false,
    error: {
      code,
      message,
      ...metadata,
    },
  };
}

async function parseBody(req: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as JsonObject)
    : {};
}

function upstreamUrl(agentBaseUrl: string, pathname: string, search = ""): URL {
  return new URL(`${pathname}${search}`, agentBaseUrl);
}

async function proxyJson(input: {
  fetchImpl: typeof fetch;
  agentBaseUrl: string;
  method: "GET" | "POST";
  pathname: string;
  search?: string;
  body?: unknown;
}): Promise<ProxyResult> {
  try {
    const response = await input.fetchImpl(
      upstreamUrl(input.agentBaseUrl, input.pathname, input.search ?? ""),
      {
        method: input.method,
        headers:
          input.body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      },
    );
    const raw = await response.text();
    const body = raw.trim() ? (JSON.parse(raw) as unknown) : {};
    return { ok: true, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      body: errorPayload(
        "AGENT_UPSTREAM_UNAVAILABLE",
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

function writeProxyResult(res: ServerResponse, result: ProxyResult): void {
  json(res, result.status, result.body);
}

function writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function assistantChunks(value: string): string[] {
  const normalized = value || "";
  if (!normalized) {
    return [""];
  }
  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += 8) {
    chunks.push(normalized.slice(index, index + 8));
  }
  return chunks;
}

function sessionIdFromPath(pathname: string, suffix = ""): string | null {
  const prefix = "/api/sessions/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const raw = pathname.slice(prefix.length);
  if (suffix) {
    if (!raw.endsWith(suffix)) {
      return null;
    }
    return decodeURIComponent(raw.slice(0, -suffix.length));
  }
  if (!raw || raw.includes("/")) {
    return null;
  }
  return decodeURIComponent(raw);
}

function getObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

async function proxyTranscript(input: {
  fetchImpl: typeof fetch;
  agentBaseUrl: string;
  sessionId: string;
}): Promise<ProxyResult> {
  const result = await proxyJson({
    fetchImpl: input.fetchImpl,
    agentBaseUrl: input.agentBaseUrl,
    method: "GET",
    pathname: `/sessions/${encodeURIComponent(input.sessionId)}`,
  });
  if (!result.ok) {
    return result;
  }
  const body = getObject(result.body);
  if (body.ok === false) {
    return result;
  }
  const session = getObject(body.session);
  return {
    ok: true,
    status: result.status,
    body: {
      ok: true,
      session_id: String(session.id ?? input.sessionId),
      messages: Array.isArray(session.messages) ? session.messages : [],
      session,
    },
  };
}

async function proxyEventStream(input: {
  req: IncomingMessage;
  res: ServerResponse;
  fetchImpl: typeof fetch;
  agentBaseUrl: string;
  search: string;
}): Promise<void> {
  try {
    const headers: HeadersInit = {};
    const lastEventId = input.req.headers["last-event-id"];
    if (typeof lastEventId === "string") {
      headers["Last-Event-ID"] = lastEventId;
    }
    const upstream = await input.fetchImpl(
      upstreamUrl(input.agentBaseUrl, "/events", input.search),
      {
        method: "GET",
        headers,
      },
    );
    applyCommonHeaders(input.res);
    input.res.statusCode = upstream.status;
    input.res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") ??
        "text/event-stream; charset=utf-8",
    );
    if (!upstream.body) {
      input.res.end();
      return;
    }
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        input.res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
      input.res.end();
    }
  } catch (error) {
    if (input.res.headersSent) {
      input.res.end();
      return;
    }
    json(
      input.res,
      502,
      errorPayload(
        "AGENT_UPSTREAM_UNAVAILABLE",
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
}

async function proxyChatMessageStream(input: {
  res: ServerResponse;
  fetchImpl: typeof fetch;
  agentBaseUrl: string;
  sessionId: string;
  body: JsonObject;
}): Promise<void> {
  applyCommonHeaders(input.res);
  input.res.statusCode = 200;
  input.res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  input.res.setHeader("Connection", "keep-alive");
  input.res.flushHeaders?.();
  writeSseEvent(input.res, "message.start", { session_id: input.sessionId });

  const result = await proxyJson({
    fetchImpl: input.fetchImpl,
    agentBaseUrl: input.agentBaseUrl,
    method: "POST",
    pathname: "/chat",
    body: {
      session_id: input.sessionId,
      message: input.body.message,
      include_scheduled_notifications: input.body.include_scheduled_notifications === true,
    },
  });

  const body = getObject(result.body);
  if (!result.ok || body.ok === false) {
    const error = getObject(body.error);
    writeSseEvent(input.res, "message.error", {
      code: String(error.code ?? "CHAT_STREAM_FAILED"),
      message: String(error.message ?? "chat stream failed"),
    });
    input.res.end();
    return;
  }

  const assistant = typeof body.assistant === "string" ? body.assistant : "";
  for (const chunk of assistantChunks(assistant)) {
    writeSseEvent(input.res, "message.delta", { delta: chunk });
  }
  writeSseEvent(input.res, "message.done", {
    ok: true,
    assistant,
    session: body.session,
  });
  input.res.end();
}

/** Create the Web BFF HTTP server that forwards Web-facing APIs to agent service. */
export function createBffHttpServer(options: BffServerOptions): Server {
  const fetchImpl = options.fetchImpl ?? fetch;
  const agentBaseUrl = options.agentBaseUrl;

  return createServer(async (req, res) => {
    try {
      applyCommonHeaders(res);
      const url = req.url ? new URL(req.url, "http://127.0.0.1") : null;
      const pathname = url?.pathname ?? "/";
      const search = url?.search ?? "";
      const method = req.method ?? "GET";

      if (method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (method === "GET" && pathname === "/api/health") {
        const result = await proxyJson({
          fetchImpl,
          agentBaseUrl,
          method: "GET",
          pathname: "/health",
        });
        if (!result.ok) {
          writeProxyResult(res, result);
          return;
        }
        json(res, result.status, {
          ok: getObject(result.body).ok !== false,
          bff: { status: "ok" },
          agent: result.body,
        });
        return;
      }

      if (method === "GET" && pathname === "/api/sessions") {
        writeProxyResult(
          res,
          await proxyJson({
            fetchImpl,
            agentBaseUrl,
            method: "GET",
            pathname: "/sessions",
          }),
        );
        return;
      }
      if (method === "POST" && pathname === "/api/sessions") {
        writeProxyResult(
          res,
          await proxyJson({
            fetchImpl,
            agentBaseUrl,
            method: "POST",
            pathname: "/sessions",
            body: {},
          }),
        );
        return;
      }

      const transcriptSessionId = sessionIdFromPath(pathname, "/transcript");
      if (method === "GET" && transcriptSessionId) {
        writeProxyResult(
          res,
          await proxyTranscript({
            fetchImpl,
            agentBaseUrl,
            sessionId: transcriptSessionId,
          }),
        );
        return;
      }

      const messageSessionId = sessionIdFromPath(pathname, "/messages");
      if (method === "POST" && messageSessionId) {
        const body = await parseBody(req);
        writeProxyResult(
          res,
          await proxyJson({
            fetchImpl,
            agentBaseUrl,
            method: "POST",
            pathname: "/chat",
            body: {
              session_id: messageSessionId,
              message: body.message,
              include_scheduled_notifications:
                body.include_scheduled_notifications === true,
            },
          }),
        );
        return;
      }

      const streamMessageSessionId = sessionIdFromPath(pathname, "/messages/stream");
      if (method === "POST" && streamMessageSessionId) {
        const body = await parseBody(req);
        await proxyChatMessageStream({
          res,
          fetchImpl,
          agentBaseUrl,
          sessionId: streamMessageSessionId,
          body,
        });
        return;
      }

      const detailSessionId = sessionIdFromPath(pathname);
      if (method === "GET" && detailSessionId) {
        writeProxyResult(
          res,
          await proxyJson({
            fetchImpl,
            agentBaseUrl,
            method: "GET",
            pathname: `/sessions/${encodeURIComponent(detailSessionId)}`,
          }),
        );
        return;
      }

      if (method === "GET" && pathname === "/api/audit/events") {
        writeProxyResult(
          res,
          await proxyJson({
            fetchImpl,
            agentBaseUrl,
            method: "GET",
            pathname: "/audit/events",
            search,
          }),
        );
        return;
      }
      if (method === "GET" && pathname === "/api/security/findings") {
        writeProxyResult(
          res,
          await proxyJson({
            fetchImpl,
            agentBaseUrl,
            method: "GET",
            pathname: "/security/findings",
            search,
          }),
        );
        return;
      }
      if (method === "GET" && pathname === "/api/events/stream") {
        await proxyEventStream({ req, res, fetchImpl, agentBaseUrl, search });
        return;
      }

      json(
        res,
        404,
        errorPayload("NOT_FOUND", `${method} ${pathname} is not implemented`),
      );
    } catch (error) {
      json(
        res,
        500,
        errorPayload(
          "INTERNAL_ERROR",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  });
}
