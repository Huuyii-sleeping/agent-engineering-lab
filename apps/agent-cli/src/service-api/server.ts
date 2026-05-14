import * as process from "node:process";
import { pathToFileURL } from "node:url";
import { AgentService, createAgentHttpServer } from "./index.js";
import { createAgentAppRuntime } from "../bootstrap/app-runtime.js";

const port = Number(process.env.AGENT_HTTP_PORT ?? 3181);

export async function runServer(): Promise<void> {
  const service = new AgentService(createAgentAppRuntime());
  const server = createAgentHttpServer(service);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve());
  });
  console.log(`agent service listening on http://0.0.0.0:${port}`);
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
