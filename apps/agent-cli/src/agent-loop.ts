import { QueryEngine } from "./runtime/query-engine.js";
import type { QueryLoopOptions } from "./runtime/query-types.js";

export type { AgentRuntimeState, QueryEngineLike, QueryEngineRunInput, QueryLoopOptions } from "./runtime/query-types.js";

export async function agentLoop(opts: QueryLoopOptions): Promise<void> {
  const engine = new QueryEngine({
    client: opts.client,
    model: opts.model,
    promptSource: opts.promptSource,
  });
  await engine.run({
    tools: opts.tools,
    messages: opts.messages,
    runtimeState: opts.runtimeState,
  });
}
