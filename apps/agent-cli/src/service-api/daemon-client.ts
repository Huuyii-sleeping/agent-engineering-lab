import { DaemonLock } from "../entrypoints/daemon-lock.js";
import type { DaemonLockStatus } from "../entrypoints/daemon-lock.js";
import { AgentServiceClient } from "./client.js";

export type RunningDaemonServiceClient = {
  client: AgentServiceClient;
  status: DaemonLockStatus;
};

type ResolveRunningDaemonServiceClientOptions = {
  runtimeRoot?: string;
  lock?: Pick<DaemonLock, "status">;
  clientFactory?: () => AgentServiceClient;
};

export async function resolveRunningDaemonServiceClient(
  options: ResolveRunningDaemonServiceClientOptions = {},
): Promise<RunningDaemonServiceClient | null> {
  const lock = options.lock ?? new DaemonLock(options.runtimeRoot);
  const status = await lock.status();
  if (status.state !== "running") {
    return null;
  }

  const client = (options.clientFactory ?? (() => new AgentServiceClient()))();
  await client.initialize();
  return { client, status };
}
