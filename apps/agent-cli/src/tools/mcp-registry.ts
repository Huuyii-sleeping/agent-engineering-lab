import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getExecutionContext, recordObservabilityEvent } from "../observability/runtime.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import type { McpServerConfig } from "./mcp-config.js";
import { McpServerClient } from "./mcp-client.js";
import {
  classifyMcpErrorCode,
  formatMcpFailure,
  makeToolAlias,
  normalizeMcpCallOutput,
  type McpToolRegistration,
} from "./mcp-protocol.js";
import { toChatCompletionTool } from "./protocol.js";

export type McpRegistryServerStatus = {
  name: string;
  trusted: boolean;
  provenance: string;
  credentialMode: "none" | "configured";
  toolCount: number;
  authFailed: boolean;
  authFailureMessage?: string;
  activeCalls: number;
  queuedCalls: number;
  maxConcurrentCalls: number;
  allowedTools: string[];
  disabledTools: string[];
};

export class McpRegistry {
  private readonly clients = new Map<string, McpServerClient>();
  private readonly activeCalls = new Map<string, number>();
  private readonly waitQueues = new Map<string, Array<() => void>>();
  private readonly authFailures = new Map<string, string>();
  private registrationsCache: McpToolRegistration[] | null = null;

  constructor(private readonly servers: McpServerConfig[]) {
    for (const server of servers) {
      this.clients.set(server.name, new McpServerClient(server));
    }
  }

  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      client.close("registry_reset");
    }
    this.registrationsCache = null;
    this.activeCalls.clear();
    this.waitQueues.clear();
    this.authFailures.clear();
  }

  private toolAllowed(server: McpServerConfig, remoteName: string): boolean {
    const normalized = remoteName.trim().toLowerCase();
    const allowedTools = server.allowedTools ?? [];
    const disabledTools = server.disabledTools ?? [];
    if (disabledTools.includes(normalized)) {
      return false;
    }
    return allowedTools.length === 0 || allowedTools.includes(normalized);
  }

  private async acquireServerSlot(serverName: string, maxConcurrentCalls: number): Promise<() => void> {
    const limit = Math.max(1, maxConcurrentCalls);
    const active = this.activeCalls.get(serverName) ?? 0;
    if (active >= limit) {
      await new Promise<void>((resolve) => {
        const queue = this.waitQueues.get(serverName) ?? [];
        queue.push(resolve);
        this.waitQueues.set(serverName, queue);
      });
    }
    this.activeCalls.set(serverName, (this.activeCalls.get(serverName) ?? 0) + 1);
    return () => {
      const nextActive = Math.max(0, (this.activeCalls.get(serverName) ?? 1) - 1);
      if (nextActive === 0) {
        this.activeCalls.delete(serverName);
      } else {
        this.activeCalls.set(serverName, nextActive);
      }
      const queue = this.waitQueues.get(serverName) ?? [];
      const next = queue.shift();
      if (queue.length === 0) {
        this.waitQueues.delete(serverName);
      } else {
        this.waitQueues.set(serverName, queue);
      }
      next?.();
    };
  }

  private async buildRegistrations(): Promise<McpToolRegistration[]> {
    const usedAliases = new Set<string>();
    const registrations: McpToolRegistration[] = [];
    for (const server of this.servers) {
      const client = this.clients.get(server.name);
      if (!client) {
        continue;
      }
      if (!server.trusted) {
        const context = getExecutionContext();
        await recordObservabilityEvent(
          "mcp_lifecycle",
          {
            serverName: server.name,
            action: "registration_blocked_untrusted",
            trust: "untrusted",
            provenance: server.provenance,
            credentialMode: server.credentialMode,
          },
          context ?? undefined,
        );
        continue;
      }
      try {
        const tools = await client.listTools();
        for (const tool of tools) {
          if (!this.toolAllowed(server, tool.name)) {
            continue;
          }
          registrations.push({
            name: makeToolAlias(server.name, tool.name, usedAliases),
            serverName: server.name,
            remoteName: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            target: "mcp",
            allowDuringReplay: false,
            execution: {
              readOnly: false,
              mutatesWorkspace: false,
              parallelSafe: false,
              riskLevel: "medium",
            },
            trust: "trusted",
            provenance: server.provenance,
            credentialMode: server.credentialMode,
          });
        }
      } catch (error) {
        const context = getExecutionContext();
        await recordObservabilityEvent(
          "mcp_lifecycle",
          {
            serverName: server.name,
            action: "list_failed",
            message: error instanceof Error ? error.message : String(error),
          },
          context ?? undefined,
        );
      }
    }
    return registrations;
  }

  async listRegistrations(): Promise<McpToolRegistration[]> {
    if (!this.registrationsCache) {
      this.registrationsCache = await this.buildRegistrations();
    }
    return this.registrationsCache;
  }

  async listTools(): Promise<ChatCompletionTool[]> {
    const registrations = await this.listRegistrations();
    return registrations.map(toChatCompletionTool);
  }

  getStatus(): McpRegistryServerStatus[] {
    const registrations = this.registrationsCache ?? [];
    return this.servers.map((server) => {
      const authFailureMessage = this.authFailures.get(server.name);
      const status: McpRegistryServerStatus = {
        name: server.name,
        trusted: server.trusted,
        provenance: server.provenance,
        credentialMode: server.credentialMode,
        toolCount: registrations.filter((tool) => tool.serverName === server.name).length,
        authFailed: Boolean(authFailureMessage),
        activeCalls: this.activeCalls.get(server.name) ?? 0,
        queuedCalls: this.waitQueues.get(server.name)?.length ?? 0,
        maxConcurrentCalls: server.maxConcurrentCalls ?? 4,
        allowedTools: server.allowedTools ?? [],
        disabledTools: server.disabledTools ?? [],
      };
      if (authFailureMessage) {
        status.authFailureMessage = authFailureMessage;
      }
      return status;
    });
  }

  resetAuthFailures(): { cleared: number } {
    const cleared = this.authFailures.size;
    this.authFailures.clear();
    return { cleared };
  }

  async run(alias: string, args: Record<string, unknown>): Promise<string | null> {
    const registrations = await this.listRegistrations();
    const tool = registrations.find((item) => item.name === alias);
    if (!tool) {
      return null;
    }
    const client = this.clients.get(tool.serverName);
    if (!client) {
      return formatMcpFailure("MCP_SERVER_NOT_FOUND", `mcp server ${tool.serverName} is not registered`, {
        server: tool.serverName,
      });
    }
    const authFailure = this.authFailures.get(tool.serverName);
    if (authFailure) {
      return formatMcpFailure("MCP_AUTH_REQUIRED", authFailure, {
        server: tool.serverName,
      });
    }
    const server = this.servers.find((item) => item.name === tool.serverName);

    const normalMaxAttempts = Math.max(1, RUNTIME_CONFIG.mcpToolRetryMaxAttempts + 1);
    const maxAttempts = Math.max(normalMaxAttempts, 2);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const release = await this.acquireServerSlot(tool.serverName, server?.maxConcurrentCalls ?? 4);
      try {
        const result = await client.callTool(tool.remoteName, args);
        const output = normalizeMcpCallOutput(tool.serverName, tool.remoteName, result);
        const context = getExecutionContext();
        await recordObservabilityEvent(
          "mcp_call",
          {
            serverName: tool.serverName,
            toolName: alias,
            remoteTool: tool.remoteName,
            attempt,
            ok: !result.isError,
          },
          context ?? undefined,
        );
        return output;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = classifyMcpErrorCode(message);
        client.close(code === "MCP_SESSION_EXPIRED" ? "session_expired" : "call_failed");
        const retryable =
          code === "MCP_SESSION_EXPIRED"
            ? attempt < 2
            : code !== "MCP_AUTH_REQUIRED" && attempt < normalMaxAttempts;
        const context = getExecutionContext();
        await recordObservabilityEvent(
          "mcp_call",
          {
            serverName: tool.serverName,
            toolName: alias,
            remoteTool: tool.remoteName,
            attempt,
            ok: false,
            retryable,
            message,
          },
          context ?? undefined,
        );
        if (code === "MCP_AUTH_REQUIRED") {
          this.authFailures.set(tool.serverName, message);
          return formatMcpFailure(code, message, {
            server: tool.serverName,
            remoteTool: tool.remoteName,
          });
        }
        if (retryable) {
          continue;
        }
        return formatMcpFailure(code, message, {
          server: tool.serverName,
          remoteTool: tool.remoteName,
        });
      } finally {
        release();
      }
    }
    return formatMcpFailure("MCP_TOOL_CALL_FAILED", `mcp tool ${alias} failed`, {
      server: tool.serverName,
      remoteTool: tool.remoteName,
    });
  }
}
