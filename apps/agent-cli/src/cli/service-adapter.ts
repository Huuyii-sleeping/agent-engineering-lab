import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { resolveRunningDaemonServiceClient } from "../service-api/daemon-client.js";

export type InteractiveCliSessionLike = {
  id: string;
  busy: boolean;
  history: ChatCompletionMessageParam[];
  messageCount?: number;
};

export type InteractiveCliServiceLike = {
  bridgeManifest(): Record<string, unknown>;
  createSession(): { id: string } | Promise<{ id: string }>;
  listSessions(): InteractiveCliSessionLike[];
  toolsMetadata(): Promise<Array<Record<string, string>>>;
  chat(input: {
    session_id?: string;
    message?: string;
    include_scheduled_notifications?: boolean;
  }): Promise<Record<string, unknown>>;
  runToolByName?(name: string, argumentsJson: string): Promise<string>;
};

export type DaemonCliServiceResolution = {
  service: InteractiveCliServiceLike;
  notice: string;
};

function formatDaemonStatusBits(input: { pid?: number; sessionCount: number }): string {
  const bits = [
    typeof input.pid === "number" ? `pid=${input.pid}` : null,
    `${input.sessionCount} shared session${input.sessionCount === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return bits.length > 0 ? ` (${bits.join(" ")})` : "";
}

export async function resolveDaemonCliService(
  runtimeRoot?: string,
): Promise<DaemonCliServiceResolution | null> {
  const resolved = await resolveRunningDaemonServiceClient({ runtimeRoot });
  if (!resolved) {
    return null;
  }
  return {
    service: resolved.client,
    notice: `Connected to daemon${formatDaemonStatusBits({
      pid: resolved.status.pid ?? undefined,
      sessionCount: resolved.client.listSessions().length,
    })}`,
  };
}

export function getInteractiveCliToolRunner(
  service: InteractiveCliServiceLike | null,
): ((name: string, argumentsJson: string) => Promise<string>) | null {
  return service?.runToolByName?.bind(service) ?? null;
}

export function getInteractiveCliBridgeEndpoint(service: InteractiveCliServiceLike): string {
  const manifest = service.bridgeManifest();
  const endpoints =
    manifest.endpoints && typeof manifest.endpoints === "object" && !Array.isArray(manifest.endpoints)
      ? (manifest.endpoints as Record<string, unknown>)
      : {};
  return typeof endpoints.events === "string" ? endpoints.events : "/events";
}
