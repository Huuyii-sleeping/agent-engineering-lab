import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getExecutionContext, recordObservabilityEvent } from "../observability/runtime.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import type { McpServerConfig } from "./mcp-config.js";
import { McpServerClient } from "./mcp-client.js";
import {
  formatMcpFailure,
  makeToolAlias,
  normalizeMcpCallOutput,
  type McpToolRegistration,
} from "./mcp-protocol.js";
import { toChatCompletionTool } from "./protocol.js";

export class McpRegistry {
  private readonly clients = new Map<string, McpServerClient>();
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
          registrations.push({
            name: makeToolAlias(server.name, tool.name, usedAliases),
            serverName: server.name,
            remoteName: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            target: "mcp",
            allowDuringReplay: false,
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

    const maxAttempts = Math.max(1, RUNTIME_CONFIG.mcpToolRetryMaxAttempts + 1);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
        client.close("call_failed");
        const message = error instanceof Error ? error.message : String(error);
        const retryable = attempt < maxAttempts;
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
        if (retryable) {
          continue;
        }
        const code = /timed out/i.test(message)
          ? "MCP_REQUEST_TIMEOUT"
          : /not writable|invalid|failed|exited|spawn/i.test(message)
            ? "MCP_PROTOCOL_ERROR"
            : "MCP_TOOL_CALL_FAILED";
        return formatMcpFailure(code, message, {
          server: tool.serverName,
          remoteTool: tool.remoteName,
        });
      }
    }
    return formatMcpFailure("MCP_TOOL_CALL_FAILED", `mcp tool ${alias} failed`, {
      server: tool.serverName,
      remoteTool: tool.remoteName,
    });
  }
}
