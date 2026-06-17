import { resolveAgentServiceBaseUrl, resolveBffPort } from "./config.js";
import { createBffHttpServer } from "./server.js";

const port = resolveBffPort();
const agentBaseUrl = resolveAgentServiceBaseUrl();
const server = await createBffHttpServer({ agentBaseUrl });

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`agent bff listening on http://0.0.0.0:${port}\n`);
  process.stdout.write(`agent upstream ${agentBaseUrl}\n`);
});
