import * as process from "node:process";
import type { DaemonLockStatus } from "./daemon-lock.js";
import { DaemonLock } from "./daemon-lock.js";
import type { AgentServiceClient } from "../service-api/client.js";
import { probeDaemonServiceClient, type DaemonServiceProbe } from "../service-api/daemon-client.js";

type DaemonStatusIo = {
  output?: NodeJS.WritableStream;
  runtimeRoot?: string;
  lock?: Pick<DaemonLock, "status">;
  clientFactory?: () => AgentServiceClient;
  probe?: () => Promise<DaemonServiceProbe>;
};

function formatDaemonStatusDetail(status: DaemonLockStatus, ready?: boolean, errorMessage?: string | null): string {
  const parts = [
    status.state === "running" && ready === true ? "ready" : null,
    status.state === "running" && ready === false
      ? `service_unavailable${errorMessage ? `=${errorMessage}` : ""}`
      : null,
    typeof status.pid === "number" ? `pid=${status.pid}` : null,
    status.cwd ? `cwd=${status.cwd}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

export function formatDaemonStatusLine(
  status: DaemonLockStatus,
  options: { ready?: boolean; errorMessage?: string | null } = {},
): string {
  if (status.state === "running") {
    return `agent-cli daemon running${formatDaemonStatusDetail(status, options.ready, options.errorMessage)}`;
  }
  if (status.state === "stale") {
    const detail = [status.detail, formatDaemonStatusDetail(status).trim()].filter(Boolean).join(" ");
    return detail ? `agent-cli daemon stale (${detail})` : "agent-cli daemon stale";
  }
  return "agent-cli daemon not running";
}

export async function runDaemonStatus(io: DaemonStatusIo = {}): Promise<number> {
  const output = io.output ?? process.stdout;
  const probed =
    io.probe?.() ??
    probeDaemonServiceClient({
      runtimeRoot: io.runtimeRoot,
      lock: io.lock,
      clientFactory: io.clientFactory,
    });
  const result = await probed;
  output.write(
    `${formatDaemonStatusLine(result.status, {
      ready: result.status.state === "running" ? result.ready : undefined,
      errorMessage: result.error?.message ?? null,
    })}\n`,
  );
  return result.status.state === "running" && result.ready ? 0 : 1;
}
