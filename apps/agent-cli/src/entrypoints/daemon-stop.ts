import * as process from "node:process";
import { DaemonLock } from "./daemon-lock.js";
import { formatDaemonStatusLine } from "./daemon-status.js";

const DEFAULT_STOP_TIMEOUT_MS = 5_000;
const DEFAULT_STOP_POLL_INTERVAL_MS = 100;

type DaemonStopIo = {
  output?: NodeJS.WritableStream;
  runtimeRoot?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  lock?: Pick<DaemonLock, "status">;
  sendSignal?: (pid: number, signal: NodeJS.Signals) => void;
  sleep?: (ms: number) => Promise<void>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDaemonStop(io: DaemonStopIo = {}): Promise<number> {
  const output = io.output ?? process.stdout;
  const lock = io.lock ?? new DaemonLock(io.runtimeRoot);
  const status = await lock.status();

  if (status.state !== "running" || typeof status.pid !== "number") {
    output.write(`${formatDaemonStatusLine(status)}\n`);
    return 1;
  }

  const sendSignal = io.sendSignal ?? ((pid: number, signal: NodeJS.Signals) => process.kill(pid, signal));
  const sleep = io.sleep ?? delay;
  output.write(`agent-cli daemon stopping pid=${status.pid}\n`);

  try {
    sendSignal(status.pid, "SIGTERM");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.write(`agent-cli daemon stop failed (${message})\n`);
    return 1;
  }

  const deadline = Date.now() + (io.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS);
  while (Date.now() < deadline) {
    await sleep(io.pollIntervalMs ?? DEFAULT_STOP_POLL_INTERVAL_MS);
    const next = await lock.status();
    if (next.state !== "running") {
      output.write(`${formatDaemonStatusLine(next)}\n`);
      return next.state === "not_running" ? 0 : 1;
    }
  }

  const finalStatus = await lock.status();
  output.write(`agent-cli daemon stop timed out (${formatDaemonStatusLine(finalStatus)})\n`);
  return 1;
}
