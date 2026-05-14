import * as process from "node:process";
import { createAgentAppRuntime } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import { AgentService } from "../service-api/index.js";
import { runServer } from "../service-api/server.js";
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
}) => Promise<void>;

type DaemonIo = {
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
  host?: DaemonHost;
  startHttpServer?: DaemonServerStarter;
  runtimeRoot?: string;
};

export async function runDaemon(
  io: DaemonIo = {},
): Promise<void> {
  const output = io.output ?? process.stdout;
  const errorOutput = io.errorOutput ?? process.stderr;
  const lock = new DaemonLock(io.runtimeRoot);
  await lock.runExclusive(async () => {
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
        const service = new AgentService(activeHost.runtime(), activeHost as AgentHost);
        await runServer({ service, output: activeOutput });
      });
    await startHttpServer({ host, output, errorOutput });
  });
}
