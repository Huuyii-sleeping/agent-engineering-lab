import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { loadMcpServerConfigs } from "./mcp-config.js";
import type { McpToolRegistration } from "./mcp-protocol.js";
import { McpRegistry } from "./mcp-registry.js";

let ACTIVE_REGISTRY: { key: string; registry: McpRegistry } | null = null;

async function getRegistry(): Promise<McpRegistry> {
  const servers = await loadMcpServerConfigs();
  const key = JSON.stringify({
    cwd: process.cwd(),
    servers: servers.map((server) => ({
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: server.cwd,
      requestTimeoutMs: server.requestTimeoutMs,
      allowedTools: server.allowedTools,
      disabledTools: server.disabledTools,
      maxConcurrentCalls: server.maxConcurrentCalls,
    })),
  });
  if (ACTIVE_REGISTRY?.key === key) {
    return ACTIVE_REGISTRY.registry;
  }
  if (ACTIVE_REGISTRY) {
    await ACTIVE_REGISTRY.registry.close();
  }
  const registry = new McpRegistry(servers);
  ACTIVE_REGISTRY = { key, registry };
  return registry;
}

export async function listMcpTools(): Promise<ChatCompletionTool[]> {
  return (await getRegistry()).listTools();
}

export async function listMcpToolRegistrations(): Promise<McpToolRegistration[]> {
  return (await getRegistry()).listRegistrations();
}

export async function runMcpToolByName(name: string, args: Record<string, unknown>): Promise<string | null> {
  return (await getRegistry()).run(name, args);
}

export async function resetMcpRegistryForTest(): Promise<void> {
  if (ACTIVE_REGISTRY) {
    await ACTIVE_REGISTRY.registry.close();
    ACTIVE_REGISTRY = null;
  }
}
