import * as process from "node:process";
import { createAgentAppRuntime } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import { AgentService } from "../service-api/index.js";
import { runServer, type AgentServerLike } from "../service-api/server.js";
import { createMastraAgentService } from "../runtime/mastra-default-service.js";
import { DaemonLock } from "./daemon-lock.js";

type DaemonHost = {
  initialize(): Promise<void>;
  runtime?(): ConstructorParameters<typeof AgentService>[0];
  listSessions?(): unknown[];
};

type DaemonServerStarter = (input: {
  host: DaemonHost;
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
}) => Promise<AgentServerLike>;

type DaemonSignalSource = {
  on(event: NodeJS.Signals, listener: () => void): unknown;
  off?(event: NodeJS.Signals, listener: () => void): unknown;
  removeListener?(event: NodeJS.Signals, listener: () => void): unknown;
};

type DaemonShutdownWaiter = (input: {
  server: AgentServerLike;
  output?: NodeJS.WritableStream;
  signalSource?: DaemonSignalSource;
}) => Promise<void>;

type DaemonIo = {
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
  host?: DaemonHost;
  startHttpServer?: DaemonServerStarter;
  waitForShutdown?: DaemonShutdownWaiter;
  signalSource?: DaemonSignalSource;
  runtimeRoot?: string;
};

const DAEMON_SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

function removeSignalListener(source: DaemonSignalSource, signal: NodeJS.Signals, listener: () => void): void {
  if (typeof source.off === "function") {
    source.off(signal, listener);
    return;
  }
  source.removeListener?.(signal, listener);
}

function closeDaemonServer(server: AgentServerLike): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finalize = (error?: Error | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    server.once("close", () => finalize());
    server.once("error", (error: Error) => finalize(error));
    server.close((error?: Error) => finalize(error));
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });
}

export async function waitForDaemonShutdown(input: {
  server: AgentServerLike;
  output?: NodeJS.WritableStream;
  signalSource?: DaemonSignalSource;
}): Promise<void> {
  const output = input.output ?? process.stdout;
  const signalSource = input.signalSource ?? (globalThis.process as DaemonSignalSource);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let shuttingDown = false;
    const listeners = new Map<NodeJS.Signals, () => void>();

    const cleanup = () => {
      for (const [signal, listener] of listeners) {
        removeSignalListener(signalSource, signal, listener);
      }
      listeners.clear();
    };

    const finalize = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    const requestShutdown = (signal: NodeJS.Signals) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      output.write(`agent-cli daemon stopping (${signal})\n`);
      void closeDaemonServer(input.server)
        .then(() => finalize())
        .catch((error) => finalize(error instanceof Error ? error : new Error(String(error))));
    };

    input.server.once("close", () => finalize());
    input.server.once("error", (error: Error) => finalize(error));

    for (const signal of DAEMON_SHUTDOWN_SIGNALS) {
      const listener = () => requestShutdown(signal);
      listeners.set(signal, listener);
      signalSource.on(signal, listener);
    }
  });
}

export async function runDaemon(
  io: DaemonIo = {},
): Promise<void> {
  const output = io.output ?? process.stdout;
  const errorOutput = io.errorOutput ?? process.stderr;
  const lock = new DaemonLock(io.runtimeRoot);
  await lock.acquire();
  try {
    const host = io.host ?? new AgentHost(createAgentAppRuntime());
    await host.initialize();
    const sessionCount = host.listSessions?.().length;
    output.write(
      typeof sessionCount === "number"
        ? `agent-cli daemon host started (${sessionCount} sessions loaded)\n`
        : "agent-cli daemon host started\n",
    );
    const startHttpServer =
      io.startHttpServer ??
      (async ({ host: activeHost, output: activeOutput }) => {
        if (!activeHost.runtime) {
          throw new Error("daemon host runtime is required to start the HTTP service");
        }
        const service = await createMastraAgentService(
          activeHost.runtime(),
          activeHost as AgentHost,
        );
        return runServer({ service, output: activeOutput });
      });
    const server = await startHttpServer({ host, output, errorOutput });
    const waitForShutdown = io.waitForShutdown ?? waitForDaemonShutdown;
    await waitForShutdown({ server, output, signalSource: io.signalSource });
  } finally {
    await lock.release();
  }
}
