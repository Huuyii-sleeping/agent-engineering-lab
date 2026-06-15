import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createBffHttpServer } from "../../src/server.js";

type SeenRequest = {
  method: string;
  pathname: string;
  search: string;
  body: unknown;
};

const servers: Server[] = [];

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("server did not bind to a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function startMockAgent(): Promise<{ baseUrl: string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = req.method ?? "GET";
    const body = method === "GET" ? {} : await readBody(req);
    seen.push({ method, pathname: url.pathname, search: url.search, body });

    if (method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true, status: "ok" });
      return;
    }
    if (method === "GET" && url.pathname === "/sessions") {
      json(res, 200, { ok: true, sessions: [{ id: "s1", busy: false, messageCount: 2 }] });
      return;
    }
    if (method === "POST" && url.pathname === "/sessions") {
      json(res, 201, { ok: true, session: { id: "s2", busy: false, messageCount: 0 } });
      return;
    }
    if (method === "GET" && url.pathname === "/sessions/s1") {
      json(res, 200, {
        ok: true,
        session: {
          id: "s1",
          busy: false,
          messageCount: 2,
          messages: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "world" },
          ],
        },
      });
      return;
    }
    if (method === "POST" && url.pathname === "/chat") {
      json(res, 200, { ok: true, session: { id: "s1" }, assistant: "reply" });
      return;
    }
    if (method === "GET" && url.pathname === "/audit/events") {
      json(res, 200, { ok: true, events: [{ id: "aud1" }], query: url.searchParams.get("limit") });
      return;
    }
    if (method === "GET" && url.pathname === "/security/findings") {
      json(res, 200, { ok: true, findings: [{ id: "sf1" }] });
      return;
    }
    if (method === "GET" && url.pathname === "/events") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.write("event: bridge.ready\n");
      res.write("data: {\"ok\":true}\n\n");
      res.end();
      return;
    }

    json(res, 404, { ok: false, error: { code: "NOT_FOUND", message: url.pathname } });
  });
  return { baseUrl: await listen(server), seen };
}

async function startBff(agentBaseUrl: string): Promise<string> {
  return listen(createBffHttpServer({ agentBaseUrl }));
}

async function requestJson(input: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(input, init);
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe("bff server", () => {
  it("forwards health, session, message, audit, and security APIs to the agent service", async () => {
    const agent = await startMockAgent();
    const bffBaseUrl = await startBff(agent.baseUrl);

    await expect(requestJson(`${bffBaseUrl}/api/health`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, bff: { status: "ok" }, agent: { ok: true, status: "ok" } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/sessions`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, sessions: [{ id: "s1" }] },
    });
    await expect(requestJson(`${bffBaseUrl}/api/sessions`, { method: "POST" })).resolves.toMatchObject({
      status: 201,
      body: { ok: true, session: { id: "s2" } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/sessions/s1`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, session: { id: "s1" } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/sessions/s1/transcript`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        session_id: "s1",
        messages: expect.arrayContaining([{ role: "user", content: "hello" }]),
      },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/sessions/s1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "continue", include_scheduled_notifications: true }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: { ok: true, assistant: "reply" },
    });
    await expect(requestJson(`${bffBaseUrl}/api/audit/events?limit=5`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, events: [{ id: "aud1" }], query: "5" },
    });
    await expect(requestJson(`${bffBaseUrl}/api/security/findings`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, findings: [{ id: "sf1" }] },
    });

    expect(agent.seen.map((item) => `${item.method} ${item.pathname}${item.search}`)).toEqual([
      "GET /health",
      "GET /sessions",
      "POST /sessions",
      "GET /sessions/s1",
      "GET /sessions/s1",
      "POST /chat",
      "GET /audit/events?limit=5",
      "GET /security/findings",
    ]);
    expect(agent.seen.find((item) => item.pathname === "/chat")?.body).toEqual({
      session_id: "s1",
      message: "continue",
      include_scheduled_notifications: true,
    });
  });

  it("normalizes unavailable upstream errors and handles CORS preflight", async () => {
    const bffBaseUrl = await startBff("http://127.0.0.1:9");

    const preflight = await fetch(`${bffBaseUrl}/api/sessions`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

    await expect(requestJson(`${bffBaseUrl}/api/sessions`)).resolves.toMatchObject({
      status: 502,
      body: {
        ok: false,
        error: { code: "AGENT_UPSTREAM_UNAVAILABLE" },
      },
    });
  });

  it("proxies agent service SSE events", async () => {
    const agent = await startMockAgent();
    const bffBaseUrl = await startBff(agent.baseUrl);

    const response = await fetch(`${bffBaseUrl}/api/events/stream?since_id=7`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: bridge.ready");
    expect(agent.seen.at(-1)).toMatchObject({
      method: "GET",
      pathname: "/events",
      search: "?since_id=7",
    });
  });

  it("streams chat message responses as SSE events", async () => {
    const agent = await startMockAgent();
    const bffBaseUrl = await startBff(agent.baseUrl);

    const response = await fetch(`${bffBaseUrl}/api/sessions/s1/messages/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "continue" }),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: message.start");
    expect(text).toContain("event: message.delta");
    expect(text).toContain("event: message.done");
    expect(text).toContain("\"delta\":\"reply\"");
    expect(agent.seen.at(-1)).toMatchObject({
      method: "POST",
      pathname: "/chat",
      body: {
        session_id: "s1",
        message: "continue",
        include_scheduled_notifications: false,
      },
    });
  });
});
