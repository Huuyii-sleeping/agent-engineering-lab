import * as process from "node:process";
import { pathToFileURL } from "node:url";
import { AgentService, createAgentHttpServer } from "./index.js";
import { createAgentAppRuntime } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";

const port = Number(process.env.AGENT_HTTP_PORT ?? 3181);

type AgentServerLike = Pick<
  Server,
  "once" | "listen"
>;

export type RunServerOptions = {
  service?: AgentService;
  host?: Pick<AgentHost, "initialize" | "runtime">;
  serverFactory?: (service: AgentService) => AgentServerLike;
  port?: number;
  output?: NodeJS.WritableStream;
};

export async function runServer(options: RunServerOptions = {}): Promise<void> {
  let service = options.service;
  if (!service) {
    const host = options.host ?? new AgentHost(createAgentAppRuntime());
    await host.initialize();
    service = new AgentService(host.runtime(), host as AgentHost);
  }
  const server = (options.serverFactory ?? createAgentHttpServer)(service);
  const targetPort = options.port ?? port;
  const output = options.output ?? process.stdout;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(targetPort, "0.0.0.0", () => resolve());
  });
  output.write(`agent service listening on http://0.0.0.0:${targetPort}\n`);
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
