import { resolveSkillRegistryConfig } from "./config.js";
import { createSkillRegistryHttpServer } from "./server.js";

const config = resolveSkillRegistryConfig();
const server = createSkillRegistryHttpServer(config);

server.listen(config.port, "0.0.0.0", () => {
  process.stdout.write(`skill registry listening on http://0.0.0.0:${config.port}\n`);
  process.stdout.write(`skill registry db ${config.dbPath}\n`);
  process.stdout.write(`skill packages ${config.packageRoot}\n`);
});
