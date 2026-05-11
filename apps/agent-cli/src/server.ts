import * as process from "node:process";
import { createAgentHttpServer } from "./agent-service.js";
import { ensureModelConfigured } from "./config.js";

const port = Number(process.env.AGENT_HTTP_PORT ?? 3181);

export async function runServer(): Promise<void> {
  ensureModelConfigured();
  const server = createAgentHttpServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve());
  });
  console.log(`agent service listening on http://0.0.0.0:${port}`);
}

runServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
