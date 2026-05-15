import { stdin, stdout } from "node:process";
import { AgentService } from "../service-api/index.js";
import { resolveRunningDaemonServiceClient } from "../service-api/daemon-client.js";
import { createAgentAppRuntime } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import { writeFrame } from "../tools/mcp-protocol.js";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcReply = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type AgentMcpServiceLike = {
  createSession(): { id: string } | Promise<{ id: string }>;
  listSessions(): unknown[];
  getSessionDetail(sessionId: string): Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
  toolsMetadata(): Promise<Array<Record<string, string>>>;
  chat(input: { session_id?: string; message?: string }): Promise<Record<string, unknown>>;
};

const EMPTY_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

export const AGENT_MCP_TOOLS = [
  {
    name: "agent_chat",
    description: "Run one message through the Agent CLI runtime.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "User message to send to the agent.",
        },
        session_id: {
          type: "string",
          description: "Optional existing AgentService session id.",
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "agent_create_session",
    description: "Create a new AgentService session.",
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: "agent_list_sessions",
    description: "List AgentService sessions.",
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: "agent_get_session",
    description: "Read one AgentService session transcript.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Session id to read.",
        },
      },
      required: ["session_id"],
      additionalProperties: false,
    },
  },
  {
    name: "agent_list_tools",
    description: "List tools available to the Agent CLI runtime.",
    inputSchema: EMPTY_SCHEMA,
  },
];

export const AGENT_CHAT_TOOL = AGENT_MCP_TOOLS[0];

function reply(id: JsonRpcId, result: unknown): JsonRpcReply {
  return { jsonrpc: "2.0", id, result };
}

function errorReply(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcReply {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getId(message: JsonRpcRequest): JsonRpcId {
  return message.id ?? null;
}

async function callAgentChat(service: AgentMcpServiceLike, params: unknown): Promise<unknown> {
  const input = getObject(params);
  const toolName = String(input.name ?? "");
  const args = getObject(input.arguments);
  let result: Record<string, unknown>;

  if (toolName === "agent_chat") {
    result = await service.chat({
      message: String(args.message ?? ""),
      session_id: typeof args.session_id === "string" ? args.session_id : undefined,
    });
  } else if (toolName === "agent_create_session") {
    result = { ok: true, session: await service.createSession() };
  } else if (toolName === "agent_list_sessions") {
    result = { ok: true, sessions: service.listSessions() };
  } else if (toolName === "agent_get_session") {
    const sessionId = String(args.session_id ?? "").trim();
    const session = sessionId ? await service.getSessionDetail(sessionId) : null;
    result = session
      ? { ok: true, session }
      : {
          ok: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: `session not found: ${sessionId || "(missing)"}`,
          },
        };
  } else if (toolName === "agent_list_tools") {
    result = { ok: true, tools: await service.toolsMetadata() };
  } else {
    throw new Error(`unknown MCP tool: ${toolName || "(missing)"}`);
  }

  const text = JSON.stringify(result, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: result,
    isError: result.ok === false,
  };
}

export async function handleAgentMcpRequest(
  service: AgentMcpServiceLike,
  request: JsonRpcRequest,
): Promise<JsonRpcReply | null> {
  const method = String(request.method ?? "");
  const id = getId(request);

  if (request.id === undefined && method.startsWith("notifications/")) {
    return null;
  }

  if (method === "initialize") {
    return reply(id, {
      protocolVersion: "2024-11-05",
      serverInfo: {
        name: "agent-cli",
        version: "0.1.0",
      },
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
    });
  }
  if (method === "tools/list") {
    return reply(id, { tools: AGENT_MCP_TOOLS });
  }
  if (method === "tools/call") {
    try {
      return reply(id, await callAgentChat(service, request.params));
    } catch (error) {
      return errorReply(id, -32602, error instanceof Error ? error.message : String(error));
    }
  }
  if (!method) {
    return errorReply(id, -32600, "invalid JSON-RPC request: method is required");
  }
  return errorReply(id, -32601, `method not found: ${method}`);
}

class StdioFrameReader {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): JsonRpcRequest[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: JsonRpcRequest[] = [];
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return messages;
      }
      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = Buffer.alloc(0);
        throw new Error("invalid MCP frame header");
      }
      const bodyLength = Number(match[1]);
      const frameEnd = headerEnd + 4 + bodyLength;
      if (this.buffer.length < frameEnd) {
        return messages;
      }
      const body = this.buffer.slice(headerEnd + 4, frameEnd).toString("utf8");
      this.buffer = this.buffer.slice(frameEnd);
      messages.push(JSON.parse(body) as JsonRpcRequest);
    }
  }
}

export type AgentMcpServerOptions = {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  service?: AgentMcpServiceLike;
  host?: Pick<AgentHost, "initialize" | "runtime">;
  resolveDaemonService?: () => Promise<AgentMcpServiceLike | null>;
};

export async function runAgentMcpServer(opts: AgentMcpServerOptions = {}): Promise<void> {
  const input = opts.input ?? stdin;
  const output = opts.output ?? stdout;
  let service = opts.service;
  if (!service) {
    if (!opts.host) {
      try {
        service =
          (await (opts.resolveDaemonService ??
            (async () => {
              const resolved = await resolveRunningDaemonServiceClient();
              return resolved?.client ?? null;
            }))()) ?? undefined;
      } catch {
        service = undefined;
      }
    }
    if (!service) {
      const host = opts.host ?? new AgentHost(createAgentAppRuntime());
      await host.initialize();
      service = new AgentService(host.runtime(), host as AgentHost);
    }
  }
  const reader = new StdioFrameReader();
  let chain = Promise.resolve();

  await new Promise<void>((resolve, reject) => {
    input.on("data", (chunk: Buffer | string) => {
      try {
        const messages = reader.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        for (const message of messages) {
          chain = chain.then(async () => {
            const response = await handleAgentMcpRequest(service, message);
            if (response) {
              writeFrame(output, response);
            }
          });
        }
      } catch (error) {
        writeFrame(output, errorReply(null, -32700, error instanceof Error ? error.message : String(error)));
      }
    });
    input.on("error", reject);
    input.on("end", () => {
      chain.then(resolve, reject);
    });
  });
}
