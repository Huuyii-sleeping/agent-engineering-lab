import * as process from "node:process";
import type { DaemonLockStatus } from "./daemon-lock.js";
import { DaemonLock } from "./daemon-lock.js";

type DaemonStatusIo = {
  output?: NodeJS.WritableStream;
  runtimeRoot?: string;
  lock?: Pick<DaemonLock, "status">;
};

function formatDaemonStatusDetail(status: DaemonLockStatus): string {
  const parts = [
    typeof status.pid === "number" ? `pid=${status.pid}` : null,
    status.cwd ? `cwd=${status.cwd}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

export function formatDaemonStatusLine(status: DaemonLockStatus): string {
  if (status.state === "running") {
    return `agent-cli daemon running${formatDaemonStatusDetail(status)}`;
  }
  if (status.state === "stale") {
    const detail = [status.detail, formatDaemonStatusDetail(status).trim()].filter(Boolean).join(" ");
    return detail ? `agent-cli daemon stale (${detail})` : "agent-cli daemon stale";
  }
  return "agent-cli daemon not running";
}

export async function runDaemonStatus(io: DaemonStatusIo = {}): Promise<number> {
  const output = io.output ?? process.stdout;
  const lock = io.lock ?? new DaemonLock(io.runtimeRoot);
  const status = await lock.status();
  output.write(`${formatDaemonStatusLine(status)}\n`);
  return status.state === "running" ? 0 : 1;
}
