import { DaemonLock } from "../entrypoints/daemon-lock.js";
import type { DaemonLockStatus } from "../entrypoints/daemon-lock.js";
import { isRemoteAttachAllowed } from "../runtime-config.js";
import { AgentServiceClient } from "./client.js";

export type RunningDaemonServiceClient = {
  client: AgentServiceClient;
  status: DaemonLockStatus;
};

export type DaemonServiceProbe = {
  status: DaemonLockStatus;
  client: AgentServiceClient | null;
  ready: boolean;
  error: Error | null;
};

type ResolveRunningDaemonServiceClientOptions = {
  runtimeRoot?: string;
  lock?: Pick<DaemonLock, "status">;
  clientFactory?: () => AgentServiceClient;
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function probeDaemonServiceClient(
  options: ResolveRunningDaemonServiceClientOptions = {},
): Promise<DaemonServiceProbe> {
  const lock = options.lock ?? new DaemonLock(options.runtimeRoot);
  const status = await lock.status();
  if (status.state !== "running") {
    return { status, client: null, ready: false, error: null };
  }

  const client = (options.clientFactory ?? (() => new AgentServiceClient()))();
  try {
    await client.initialize();
    return { status, client, ready: true, error: null };
  } catch (error) {
    return { status, client: null, ready: false, error: toError(error) };
  }
}

export async function resolveRunningDaemonServiceClient(
  options: ResolveRunningDaemonServiceClientOptions = {},
): Promise<RunningDaemonServiceClient | null> {
  if (!isRemoteAttachAllowed()) {
    return null;
  }
  const probed = await probeDaemonServiceClient(options);
  if (probed.error) {
    throw probed.error;
  }
  if (!probed.ready || !probed.client || probed.status.state !== "running") {
    return null;
  }
  return { client: probed.client, status: probed.status };
}
