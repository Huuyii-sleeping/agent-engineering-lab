import { describe, expect, it, vi } from "vitest";
import {
  AGENT_MCP_TOOLS,
  handleAgentMcpRequest,
  type AgentMcpServiceLike,
} from "../../../src/entrypoints/mcp-server.js";

function createService(): AgentMcpServiceLike {
  return {
    createSession: vi.fn(() => ({ id: "new-session" })),
    listSessions: vi.fn(() => [{ id: "s01", messageCount: 2 }]),
    getSessionDetail: vi.fn((sessionId: string) =>
      sessionId === "s01" ? { id: "s01", messages: [{ role: "user", content: "hello" }] } : null,
    ),
    toolsMetadata: vi.fn(async () => [{ name: "read_file", target: "base", description: "Read" }]),
    chat: vi.fn(async (input) => ({
      ok: true,
      assistant: `reply:${input.message}`,
      session: { id: input.session_id ?? "new-session" },
    })),
  };
}

describe("entrypoints/mcp-server", () => {
  it("responds to initialize with MCP server capabilities", async () => {
    const response = await handleAgentMcpRequest(createService(), {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: { name: "agent-cli" },
        capabilities: { tools: { listChanged: false } },
      },
    });
  });

  it("lists the agent chat tool", async () => {
    const response = await handleAgentMcpRequest(createService(), {
      jsonrpc: "2.0",
      id: "tools",
      method: "tools/list",
      params: {},
    });

    expect(response?.result).toEqual({ tools: AGENT_MCP_TOOLS });
  });

  it("keeps JSON-RPC id zero as a response id", async () => {
    const response = await handleAgentMcpRequest(createService(), {
      jsonrpc: "2.0",
      id: 0,
      method: "tools/list",
      params: {},
    });

    expect(response?.id).toBe(0);
  });

  it("routes agent_chat calls through AgentService.chat", async () => {
    const service = createService();
    const response = await handleAgentMcpRequest(service, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "agent_chat",
        arguments: { message: "hello", session_id: "s01" },
      },
    });

    expect(service.chat).toHaveBeenCalledWith({ message: "hello", session_id: "s01" });
    expect(response?.result).toMatchObject({
      content: [{ type: "text" }],
      structuredContent: {
        ok: true,
        assistant: "reply:hello",
        session: { id: "s01" },
      },
      isError: false,
    });
  });

  it("routes session and tool management calls through AgentService", async () => {
    const service = createService();
    const created = await handleAgentMcpRequest(service, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "agent_create_session", arguments: {} },
    });
    const sessions = await handleAgentMcpRequest(service, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "agent_list_sessions", arguments: {} },
    });
    const transcript = await handleAgentMcpRequest(service, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "agent_get_session", arguments: { session_id: "s01" } },
    });
    const tools = await handleAgentMcpRequest(service, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "agent_list_tools", arguments: {} },
    });

    expect(created?.result).toMatchObject({ structuredContent: { ok: true, session: { id: "new-session" } } });
    expect(sessions?.result).toMatchObject({ structuredContent: { ok: true, sessions: [{ id: "s01" }] } });
    expect(transcript?.result).toMatchObject({ structuredContent: { ok: true, session: { id: "s01" } } });
    expect(tools?.result).toMatchObject({ structuredContent: { ok: true, tools: [{ name: "read_file" }] } });
  });

  it("rejects unknown tools without calling the service", async () => {
    const service = createService();
    const response = await handleAgentMcpRequest(service, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "missing",
        arguments: { message: "hello" },
      },
    });

    expect(service.chat).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      id: 3,
      error: {
        code: -32602,
        message: "unknown MCP tool: missing",
      },
    });
  });
});
