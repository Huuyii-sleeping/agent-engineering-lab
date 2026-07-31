import * as process from "node:process";

export const DEFAULT_AGENT_HTTP_PORT = 3181;

export function resolveAgentHttpPort(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.AGENT_HTTP_PORT ?? DEFAULT_AGENT_HTTP_PORT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AGENT_HTTP_PORT;
}

export function resolveAgentServiceBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `http://127.0.0.1:${resolveAgentHttpPort(env)}`;
}
