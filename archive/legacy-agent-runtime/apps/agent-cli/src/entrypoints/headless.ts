import { randomUUID } from "node:crypto";
import { stderr, stdout } from "node:process";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  createAgentAppRuntime,
  createAgentRuntimeState,
  type AgentAppRuntimeDeps,
} from "../bootstrap/app-runtime.js";
import { runUserQuery } from "../runtime/query-runtime.js";

export type HeadlessQueryOptions = {
  prompt: string;
  app?: AgentAppRuntimeDeps;
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
};

export async function runHeadlessQuery(opts: HeadlessQueryOptions): Promise<number> {
  const app = opts.app ?? createAgentAppRuntime();
  const output = opts.output ?? stdout;
  const errorOutput = opts.errorOutput ?? stderr;
  const history: ChatCompletionMessageParam[] = [];
  const runtimeState = createAgentRuntimeState(randomUUID());
  const result = await runUserQuery({
    app,
    history,
    runtimeState,
    prompt: opts.prompt,
  });

  if (!result.ok) {
    errorOutput.write(`${result.error.code}: ${result.error.message}\n`);
    return 1;
  }
  if (result.assistant.trim()) {
    output.write(`${result.assistant.trim()}\n`);
  }
  return 0;
}
