import { QueryEngine } from "./runtime/query-engine.js";
import type { QueryLoopOptions } from "./runtime/query-types.js";
import { DEFAULT_DELIVERY_SERVICE } from "./delivery-service.js";
import { DEFAULT_HOOK_SERVICE } from "./hook-service.js";
import { DEFAULT_TOOL_SERVICE } from "./tools/service.js";

export type { AgentRuntimeState, QueryEngineLike, QueryEngineRunInput, QueryLoopOptions } from "./runtime/query-types.js";

export async function agentLoop(opts: QueryLoopOptions): Promise<void> {
  const engine = new QueryEngine({
    client: opts.client,
    model: opts.model,
    promptSource: opts.promptSource,
    toolService: DEFAULT_TOOL_SERVICE,
    deliveryService: DEFAULT_DELIVERY_SERVICE,
    hookService: DEFAULT_HOOK_SERVICE,
  });
  await engine.run({
    tools: opts.tools,
    messages: opts.messages,
    runtimeState: opts.runtimeState,
  });
}
