import * as process from "node:process";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { AgentService } from "./index.js";
import { createAgentAppRuntime } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import { resolveAgentHttpPort } from "./config.js";
import { createNestAgentHttpServer } from "../nest/server.js";
import { createMastraAgentService } from "../runtime/mastra-default-service.js";

/** CLI/daemon 宿主真正需要的最小 HTTP server 生命周期接口。 */
export type AgentServerLike = {
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "close", listener: () => void): unknown;
  listen(port: number, host: string, callback: () => void): unknown;
  close(callback?: (error?: Error) => void): unknown;
  closeAllConnections?(): void;
  closeIdleConnections?(): void;
  address?(): AddressInfo | string | null;
};

export type RunServerOptions = {
  service?: AgentService;
  host?: Pick<AgentHost, "initialize" | "runtime">;
  serverFactory?: (service: AgentService) => AgentServerLike | Promise<AgentServerLike>;
  port?: number;
  output?: NodeJS.WritableStream;
};

export async function runServer(options: RunServerOptions = {}): Promise<AgentServerLike> {
  let service = options.service;
  if (!service) {
    const host = options.host ?? new AgentHost(createAgentAppRuntime());
    await host.initialize();
    service = await createMastraAgentService(host.runtime(), host as AgentHost);
  }
  const server = options.serverFactory
    ? await options.serverFactory(service)
    : await createNestAgentHttpServer(service, { enableShutdownHooks: true });
  const targetPort = options.port ?? resolveAgentHttpPort();
  const output = options.output ?? process.stdout;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(targetPort, "0.0.0.0", () => resolve());
  });
  output.write(`agent service listening on http://0.0.0.0:${targetPort}\n`);
  return server;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  runServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
