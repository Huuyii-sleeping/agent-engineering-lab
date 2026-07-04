import { Injectable } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { errorPayload, applyCommonHeaders, writeJson, type JsonObject } from "./http-utils.js";

type ProxyResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: JsonObject };

export type AgentProxyOptions = {
  agentBaseUrl: string;
  fetchImpl?: typeof fetch;
};

function getObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function upstreamUrl(agentBaseUrl: string, pathname: string, search = ""): URL {
  return new URL(`${pathname}${search}`, agentBaseUrl);
}

@Injectable()
export class AgentProxyService {
  private readonly agentBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AgentProxyOptions) {
    this.agentBaseUrl = options.agentBaseUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async proxyJson(input: {
    method: "GET" | "POST";
    pathname: string;
    search?: string;
    body?: unknown;
  }): Promise<ProxyResult> {
    try {
      const response = await this.fetchImpl(upstreamUrl(this.agentBaseUrl, input.pathname, input.search ?? ""), {
        method: input.method,
        headers: input.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      });
      const raw = await response.text();
      const body = raw.trim() ? (JSON.parse(raw) as unknown) : {};
      return { ok: true, status: response.status, body };
    } catch (error) {
      return {
        ok: false,
        status: 502,
        body: errorPayload("AGENT_UPSTREAM_UNAVAILABLE", error instanceof Error ? error.message : String(error)),
      };
    }
  }

  async health(): Promise<ProxyResult> {
    return this.proxyJson({ method: "GET", pathname: "/health" });
  }

  async sessions(): Promise<ProxyResult> {
    return this.proxyJson({ method: "GET", pathname: "/sessions" });
  }

  async createSession(body: JsonObject = {}): Promise<ProxyResult> {
    return this.proxyJson({ method: "POST", pathname: "/sessions", body: { agent: body.agent } });
  }

  async sessionDetail(sessionId: string): Promise<ProxyResult> {
    return this.proxyJson({ method: "GET", pathname: `/sessions/${encodeURIComponent(sessionId)}` });
  }

  async transcript(sessionId: string): Promise<ProxyResult> {
    const result = await this.sessionDetail(sessionId);
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
        session_id: String(session.id ?? sessionId),
        messages: Array.isArray(session.messages) ? session.messages : [],
        session,
      },
    };
  }

  async sendMessage(sessionId: string, body: JsonObject): Promise<ProxyResult> {
    return this.proxyJson({
      method: "POST",
      pathname: "/chat",
      body: {
        session_id: sessionId,
        message: body.message,
        agent: body.agent,
        include_scheduled_notifications: body.include_scheduled_notifications === true,
      },
    });
  }

  async resolveAgentSkills(body: JsonObject): Promise<ProxyResult> {
    return this.proxyJson({
      method: "POST",
      pathname: "/skills/resolve",
      body: { agent: body.agent },
    });
  }

  async auditEvents(search: string): Promise<ProxyResult> {
    return this.proxyJson({ method: "GET", pathname: "/audit/events", search });
  }

  async securityFindings(search: string): Promise<ProxyResult> {
    return this.proxyJson({ method: "GET", pathname: "/security/findings", search });
  }

  async proxyEventStream(req: IncomingMessage, res: ServerResponse, search: string): Promise<void> {
    try {
      const headers: HeadersInit = {};
      const lastEventId = req.headers["last-event-id"];
      if (typeof lastEventId === "string") {
        headers["Last-Event-ID"] = lastEventId;
      }
      const upstream = await this.fetchImpl(upstreamUrl(this.agentBaseUrl, "/events", search), {
        method: "GET",
        headers,
      });
      applyCommonHeaders(res);
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8");
      await this.pipeWebStream(upstream, res);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      writeJson(
        res,
        502,
        errorPayload("AGENT_UPSTREAM_UNAVAILABLE", error instanceof Error ? error.message : String(error)),
      );
    }
  }

  async proxyChatMessageStream(res: ServerResponse, sessionId: string, body: JsonObject): Promise<void> {
    try {
      const upstream = await this.fetchImpl(upstreamUrl(this.agentBaseUrl, "/chat/stream"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: body.message,
          agent: body.agent,
          include_scheduled_notifications: body.include_scheduled_notifications === true,
        }),
      });
      applyCommonHeaders(res);
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      await this.pipeWebStream(upstream, res);
    } catch (error) {
      if (res.headersSent) {
        this.writeSseEvent(res, "message.error", {
          code: "AGENT_UPSTREAM_UNAVAILABLE",
          message: error instanceof Error ? error.message : String(error),
        });
        res.end();
        return;
      }
      writeJson(
        res,
        502,
        errorPayload("AGENT_UPSTREAM_UNAVAILABLE", error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private async pipeWebStream(upstream: Response, res: ServerResponse): Promise<void> {
    if (!upstream.body) {
      res.end();
      return;
    }
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  }

  private writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
