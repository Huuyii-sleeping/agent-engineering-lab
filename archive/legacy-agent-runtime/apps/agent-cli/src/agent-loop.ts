import { createAgentAppRuntime } from "./bootstrap/app-runtime.js";
import type { QueryLoopOptions } from "./runtime/query-types.js";

export type {
  AgentRuntimeState,
  QueryEngineLike,
  QueryEngineRunInput,
  QueryLoopOptions,
} from "./runtime/query-types.js";

export async function agentLoop(opts: QueryLoopOptions): Promise<void> {
  const app = createAgentAppRuntime({
    client: opts.client,
    model: opts.model,
    promptSource: opts.promptSource,
  });
  await app.queryEngine.run({
    tools: opts.tools,
    messages: opts.messages,
    runtimeState: opts.runtimeState,
    includeScheduledNotifications: opts.includeScheduledNotifications,
  });
}
