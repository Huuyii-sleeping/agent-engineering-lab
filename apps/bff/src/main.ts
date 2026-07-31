import {
  resolveAgentServiceBaseUrl,
  resolveBffPort,
  resolveSkillHubDataRoot,
  resolveSkillRegistryAdminToken,
  resolveSkillRegistryServiceUrl,
  resolveSopDataRoot,
} from "./config.js";
import { createBffHttpServer } from "./server.js";

const port = resolveBffPort();
const agentBaseUrl = resolveAgentServiceBaseUrl();
const skillDataRoot = resolveSkillHubDataRoot();
const registryServiceUrl = resolveSkillRegistryServiceUrl();
const registryAdminToken = resolveSkillRegistryAdminToken();
const sopDataRoot = resolveSopDataRoot();
const server = await createBffHttpServer({
  agentBaseUrl,
  skillDataRoot,
  registryServiceUrl,
  registryAdminToken,
  sopDataRoot,
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`agent bff listening on http://0.0.0.0:${port}\n`);
  process.stdout.write(`agent upstream ${agentBaseUrl}\n`);
  process.stdout.write(`skillhub data root ${skillDataRoot}\n`);
  if (registryServiceUrl) {
    process.stdout.write(`skill registry ${registryServiceUrl}\n`);
  }
  process.stdout.write(`sop data root ${sopDataRoot}\n`);
});
