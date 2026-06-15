import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  createAgentEventStream,
  fetchHealth,
  fetchSession,
  fetchSessions,
  sendSessionMessage,
  sendSessionMessageStream,
} from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web-console api client", () => {
  it("opens the BFF SSE endpoint and parses known agent events", () => {
    const listeners = new Map<string, (event: MessageEvent<string>) => void>();
    class FakeEventSource {
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(readonly url: string) {}

      addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
        listeners.set(type, listener);
      }

      close = vi.fn();
    }

    const onOpen = vi.fn();
    const onError = vi.fn();
    const onEvent = vi.fn();
    const stream = createAgentEventStream({
      eventSourceCtor: FakeEventSource,
      onOpen,
      onError,
      onEvent,
    });
    const source = stream as FakeEventSource;

    expect(source.url).toBe("/api/events/stream?since_id=-1");
    source.onopen?.(new Event("open"));
    source.onerror?.(new Event("error"));
    listeners.get("chat.completed")?.(
      new MessageEvent("chat.completed", {
        data: JSON.stringify({ id: 3, payload: { session_id: "s1" } }),
        lastEventId: "3",
      }),
    );
    stream.close();

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      type: "chat.completed",
      id: "3",
      data: { id: 3, payload: { session_id: "s1" } },
    });
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("calls BFF health, session, and message endpoints", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";

      if (method === "GET" && url.pathname === "/api/health") {
        return jsonResponse({ ok: true, bff: { status: "ok" }, agent: { ok: true } });
      }
      if (method === "GET" && url.pathname === "/api/sessions") {
        return jsonResponse({ ok: true, sessions: [{ id: "s1", busy: false, messageCount: 1 }] });
      }
      if (method === "POST" && url.pathname === "/api/sessions") {
        return jsonResponse({ ok: true, session: { id: "s2", busy: false, messageCount: 0 } }, 201);
      }
      if (method === "GET" && url.pathname === "/api/sessions/s1") {
        return jsonResponse({
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
      }
      if (method === "POST" && url.pathname === "/api/sessions/s1/messages") {
        return jsonResponse({
          ok: true,
          assistant: "reply",
          session: { id: "s1", busy: false, messageCount: 3 },
        });
      }

      return jsonResponse({ ok: false, error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHealth()).resolves.toMatchObject({ ok: true, connected: true });
    await expect(fetchSessions()).resolves.toMatchObject([{ id: "s1", messageCount: 1 }]);
    await expect(createSession()).resolves.toMatchObject({ id: "s2" });
    await expect(fetchSession("s1")).resolves.toMatchObject({
      id: "s1",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "world" },
      ],
    });
    await expect(sendSessionMessage("s1", "continue")).resolves.toMatchObject({
      ok: true,
      assistant: "reply",
    });

    expect(fetchMock).toHaveBeenLastCalledWith("/api/sessions/s1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "continue" }),
    });
  });

  it("normalizes BFF errors into thrown Error objects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        jsonResponse(
          { ok: false, error: { code: "AGENT_UPSTREAM_UNAVAILABLE", message: "agent down" } },
          502,
        ),
      ),
    );

    await expect(fetchSessions()).rejects.toThrow("agent down");
  });

  it("parses message-level SSE events from streamed sends", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        [
          "event: message.start\n",
          "data: {\"session_id\":\"s1\"}\n\n",
          "event: message.delta\n",
          "data: {\"delta\":\"hel\"}\n\n",
          "event: message.delta\n",
          "data: {\"delta\":\"lo\"}\n\n",
          "event: message.done\n",
          "data: {\"ok\":true,\"assistant\":\"hello\",\"session\":{\"id\":\"s1\",\"messageCount\":2}}\n\n",
        ].join(""),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const events: string[] = [];

    await sendSessionMessageStream("s1", "continue", (event) => {
      if (event.type === "message.delta") {
        events.push(event.data.delta ?? "");
      }
      if (event.type === "message.done") {
        events.push(event.data.assistant ?? "");
      }
    });

    expect(events).toEqual(["hel", "lo", "hello"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/s1/messages/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ message: "continue" }),
    });
  });
});
