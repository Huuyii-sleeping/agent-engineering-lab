import { stderr, stdout } from "node:process";
import { createAgentAppRuntime, type AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import { createMastraAgentService } from "../runtime/mastra-default-service.js";
import type { AgentService } from "../service-api/index.js";

export type HeadlessQueryOptions = {
  prompt: string;
  app?: AgentAppRuntimeDeps;
  service?: Pick<AgentService, "chat">;
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
};

export async function runHeadlessQuery(opts: HeadlessQueryOptions): Promise<number> {
  const output = opts.output ?? stdout;
  const errorOutput = opts.errorOutput ?? stderr;
  const service = opts.service ?? await (async () => {
    const app = opts.app ?? createAgentAppRuntime();
    const host = new AgentHost(app);
    await host.initialize();
    return createMastraAgentService(app, host);
  })();
  const result = await service.chat({ message: opts.prompt });

  if (result.ok === false) {
    const error = result.error as { code?: unknown; message?: unknown } | undefined;
    errorOutput.write(`${String(error?.code ?? "AGENT_EXECUTION_FAILED")}: ${String(error?.message ?? "Agent execution failed")}\n`);
    return 1;
  }
  const assistant = String(result.assistant ?? "").trim();
  if (assistant) {
    output.write(`${assistant}\n`);
  }
  return 0;
}
