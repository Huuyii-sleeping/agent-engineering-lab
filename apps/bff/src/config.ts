import * as process from "node:process";

export const DEFAULT_BFF_PORT = 3182;
export const DEFAULT_AGENT_SERVICE_BASE_URL = "http://127.0.0.1:3181";
export const DEFAULT_SKILL_REGISTRY_SERVICE_URL = "http://127.0.0.1:3190";
export const DEFAULT_SKILL_REGISTRY_ADMIN_TOKEN = "local-dev-skill-registry-admin-token";

function readPort(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Resolve the port used by the Web BFF HTTP server. */
export function resolveBffPort(env: NodeJS.ProcessEnv = process.env): number {
  return readPort(env.BFF_PORT, DEFAULT_BFF_PORT);
}

/** Resolve the upstream agent service base URL used by BFF forwarding. */
export function resolveAgentServiceBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.AGENT_SERVICE_BASE_URL?.trim() || DEFAULT_AGENT_SERVICE_BASE_URL;
  return trimTrailingSlash(raw);
}

/** Resolve the Docker-backed Skill Registry service base URL used by Skill Hub. */
export function resolveSkillRegistryServiceUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.SKILL_REGISTRY_SERVICE_URL?.trim() || DEFAULT_SKILL_REGISTRY_SERVICE_URL;
  return trimTrailingSlash(raw);
}

/** Resolve the bearer token used by BFF for Skill Registry admin publish calls. */
export function resolveSkillRegistryAdminToken(env: NodeJS.ProcessEnv = process.env): string {
  return env.SKILL_REGISTRY_ADMIN_TOKEN?.trim() || DEFAULT_SKILL_REGISTRY_ADMIN_TOKEN;
}
