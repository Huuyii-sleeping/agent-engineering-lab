import { readFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { RUNTIME_CONFIG, getPrivacyConfig } from "../runtime-config.js";

export type McpServerConfig = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  enabled: boolean;
  trusted: boolean;
  provenance: string;
  credentialMode: "none" | "configured";
  requestTimeoutMs: number;
  allowedTools?: string[];
  disabledTools?: string[];
  maxConcurrentCalls?: number;
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

function normalizeStringList(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [
    ...new Set(
      rawItems
        .map((item) => String(item ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function normalizeServerConfig(item: unknown, configPath: string): McpServerConfig | null {
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
  const maxConcurrentCalls = Number(input.maxConcurrentCalls);
  return {
    name,
    command,
    args,
    env: normalizeStringMap(input.env),
    cwd,
    enabled: input.enabled !== false,
    trusted: input.trusted === true,
    provenance: `${configPath}#${name}`,
    credentialMode: Object.keys(normalizeStringMap(input.env)).length > 0 ? "configured" : "none",
    requestTimeoutMs:
      Number.isFinite(timeoutOverride) && timeoutOverride >= 100
        ? Math.trunc(timeoutOverride)
        : RUNTIME_CONFIG.mcpRequestTimeoutMs,
    allowedTools: normalizeStringList(input.allowedTools),
    disabledTools: normalizeStringList(input.disabledTools),
    maxConcurrentCalls:
      Number.isFinite(maxConcurrentCalls) && maxConcurrentCalls >= 1
        ? Math.trunc(maxConcurrentCalls)
        : 4,
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
  const normalized = servers
    .map((item) => normalizeServerConfig(item, configPath))
    .filter((item): item is McpServerConfig => Boolean(item))
    .filter((item) => item.enabled);
  const privacy = getPrivacyConfig();
  if (privacy.externalCapabilitiesMode === "disabled") {
    return [];
  }
  if (privacy.externalCapabilitiesMode === "allowlist") {
    const allowed = new Set(privacy.mcpAllowlist);
    return normalized.filter((item) => allowed.has(item.name.toLowerCase()));
  }
  return normalized;
}
