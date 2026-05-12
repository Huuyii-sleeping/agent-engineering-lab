import { readFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { RUNTIME_CONFIG } from "../runtime-config.js";

export type McpServerConfig = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  enabled: boolean;
  requestTimeoutMs: number;
};

function parseConfigObject(raw: string): { schemaVersion?: unknown; servers?: unknown } {
  try {
    return JSON.parse(raw) as { schemaVersion?: unknown; servers?: unknown };
  } catch {
    return {};
  }
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item ?? "")]),
  );
}

function normalizeServerConfig(item: unknown): McpServerConfig | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const input = item as Record<string, unknown>;
  const name = String(input.name ?? "").trim();
  const command = String(input.command ?? "").trim();
  if (!name || !command) {
    return null;
  }
  const args = Array.isArray(input.args) ? input.args.map((value) => String(value)) : [];
  const cwd = input.cwd ? path.resolve(process.cwd(), String(input.cwd)) : process.cwd();
  const timeoutOverride = Number(input.requestTimeoutMs);
  return {
    name,
    command,
    args,
    env: normalizeStringMap(input.env),
    cwd,
    enabled: input.enabled !== false,
    requestTimeoutMs:
      Number.isFinite(timeoutOverride) && timeoutOverride >= 100
        ? Math.trunc(timeoutOverride)
        : RUNTIME_CONFIG.mcpRequestTimeoutMs,
  };
}

export async function loadMcpServerConfigs(): Promise<McpServerConfig[]> {
  const configPath = path.join(process.cwd(), ".codex", "mcp.json");
  const raw = await readFile(configPath, "utf8").catch(() => "");
  if (!raw.trim()) {
    return [];
  }
  const parsed = parseConfigObject(raw);
  const servers = Array.isArray(parsed.servers) ? parsed.servers : [];
  return servers
    .map((item) => normalizeServerConfig(item))
    .filter((item): item is McpServerConfig => Boolean(item))
    .filter((item) => item.enabled);
}
