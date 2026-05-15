import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import { AgentServiceClient } from "../../../src/service-api/client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("service-api/client", () => {
  it("hydrates shared sessions and refreshes them after remote calls", async () => {
    const sessions = new Map<string, { busy: boolean; messages: ChatCompletionMessageParam[] }>([
      ["s01", { busy: false, messages: [{ role: "user", content: "hello daemon" }] }],
    ]);
    let nextSessionId = 2;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";

      if (method === "GET" && url.pathname === "/health") {
        return jsonResponse({ ok: true, status: "ok" });
      }
      if (method === "GET" && url.pathname === "/bridge") {
        return jsonResponse({
          ok: true,
          name: "agent-cli-bridge",
          endpoints: {
            events: "/events",
            toolCall: "/tools/call",
          },
        });
      }
      if (method === "GET" && url.pathname === "/sessions") {
        return jsonResponse({
          ok: true,
          sessions: [...sessions.entries()].map(([id, session]) => ({
            id,
            busy: session.busy,
            messageCount: session.messages.length,
          })),
        });
      }
      if (method === "GET" && url.pathname.startsWith("/sessions/")) {
        const sessionId = decodeURIComponent(url.pathname.slice("/sessions/".length));
        const session = sessions.get(sessionId);
        if (!session) {
          return jsonResponse({
            ok: false,
            error: { code: "SESSION_NOT_FOUND", message: sessionId },
          }, 404);
        }
        return jsonResponse({
          ok: true,
          session: {
            id: sessionId,
            busy: session.busy,
            messageCount: session.messages.length,
            messages: session.messages,
          },
        });
      }
      if (method === "POST" && url.pathname === "/sessions") {
        const sessionId = `s${String(nextSessionId).padStart(2, "0")}`;
        nextSessionId += 1;
        sessions.set(sessionId, { busy: false, messages: [] });
        return jsonResponse({
          ok: true,
          session: {
            id: sessionId,
            busy: false,
            messageCount: 0,
          },
        }, 201);
      }
      if (method === "GET" && url.pathname === "/tools") {
        return jsonResponse({
          ok: true,
          tools: [{ name: "bash", target: "base", description: "Shell" }],
        });
      }
      if (method === "POST" && url.pathname === "/chat") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { session_id?: string; message?: string };
        const sessionId = String(body.session_id ?? "s01");
        const session = sessions.get(sessionId);
        if (!session) {
          return jsonResponse({
            ok: false,
            error: { code: "SESSION_NOT_FOUND", message: sessionId },
          }, 400);
        }
        session.messages.push({ role: "user", content: String(body.message ?? "") });
        session.messages.push({ role: "assistant", content: `reply:${String(body.message ?? "")}` });
        return jsonResponse({
          ok: true,
          assistant: `reply:${String(body.message ?? "")}`,
          session: {
            id: sessionId,
            busy: false,
            messageCount: session.messages.length,
          },
        });
      }
      if (method === "POST" && url.pathname === "/tools/call") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string; arguments_json?: string };
        return jsonResponse({
          ok: true,
          output: `tool:${String(body.name ?? "")}:${String(body.arguments_json ?? "")}`,
        });
      }

      throw new Error(`unexpected request: ${method} ${url.pathname}`);
    });

    const client = new AgentServiceClient({
      baseUrl: "http://127.0.0.1:4318",
      fetchImpl,
    });

    await client.initialize();

    expect(client.bridgeManifest()).toMatchObject({
      endpoints: {
        events: "http://127.0.0.1:4318/events",
        toolCall: "http://127.0.0.1:4318/tools/call",
      },
    });
    expect(client.listSessions()).toMatchObject([
      {
        id: "s01",
        history: [{ role: "user", content: "hello daemon" }],
      },
    ]);
    expect(await client.toolsMetadata()).toEqual([{ name: "bash", target: "base", description: "Shell" }]);

    const created = await client.createSession();
    expect(created).toEqual({ id: "s02" });
    expect(client.listSessions().map((session) => session.id)).toEqual(["s01", "s02"]);

    const result = await client.chat({ session_id: "s01", message: "follow up" });
    expect(result).toMatchObject({
      ok: true,
      assistant: "reply:follow up",
      session: { id: "s01" },
    });
    expect(client.listSessions()[0]?.history.at(-1)).toMatchObject({
      role: "assistant",
      content: "reply:follow up",
    });
    expect(await client.runToolByName("bash", "{\"command\":\"pwd\"}")).toBe(
      "tool:bash:{\"command\":\"pwd\"}",
    );
  });

  it("returns a daemon unavailable error result when chat transport fails", async () => {
    const client = new AgentServiceClient({
      baseUrl: "http://127.0.0.1:4318",
      fetchImpl: vi.fn<typeof fetch>(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/chat") {
          throw new Error("socket closed");
        }
        return jsonResponse({ ok: true });
      }),
    });

    await expect(client.chat({ message: "hello" })).resolves.toMatchObject({
      ok: false,
      error: { code: "DAEMON_UNAVAILABLE", message: "socket closed" },
    });
  });
});
