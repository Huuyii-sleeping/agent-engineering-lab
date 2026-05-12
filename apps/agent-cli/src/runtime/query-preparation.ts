import type { AgentRuntimeState } from "../agent-loop.js";
import type { HookServiceLike } from "../hook-service.js";
import type { MemoryServiceLike } from "../memory-service.js";
import type { ObservabilityServiceLike } from "../observability-service.js";
import { collectDynamicSystemMessages } from "./query-notifications.js";
import { tickScheduler } from "../tools/scheduler.js";
import { runAutonomyTick } from "../tools/autonomy.js";

export type QueryRoundPreparationResult =
  | {
      ok: true;
      dynamicSystemMessages: string[];
      memoryContext: string | null;
    }
  | {
      ok: false;
      blockedReason: string;
    };

type PrepareQueryRoundOptions = {
  runtimeState: AgentRuntimeState;
  traceId: string;
  latestUserInput: string;
  hookService: HookServiceLike;
  memoryService: MemoryServiceLike;
  observabilityService: ObservabilityServiceLike;
};

export async function prepareQueryRound(
  opts: PrepareQueryRoundOptions,
): Promise<QueryRoundPreparationResult> {
  const sessionStartHooks = await opts.hookService.run("SessionStart", {
    session_id: opts.runtimeState.sessionId,
    trace_id: opts.traceId,
    payload: {
      round: opts.runtimeState.roundCounter,
      rounds_without_todo: opts.runtimeState.roundsWithoutTodo,
      latest_user_input: opts.latestUserInput,
    },
  });
  if (sessionStartHooks.blocked) {
    return {
      ok: false,
      blockedReason: sessionStartHooks.blockReason ?? "blocked by hook",
    };
  }

  if (opts.latestUserInput && opts.runtimeState.lastMemoryInput !== opts.latestUserInput) {
    await opts.memoryService.autoExtract("user", opts.latestUserInput);
    opts.runtimeState.lastMemoryInput = opts.latestUserInput;
  }

  try {
    const autonomyRaw = await runAutonomyTick();
    const autonomy = JSON.parse(autonomyRaw) as { ok?: boolean; action?: string; taskId?: number };
    if (autonomy.ok && autonomy.action === "claimed") {
      console.log(`\u001b[36m[autonomy]\u001b[0m claimed task #${autonomy.taskId ?? "?"}`);
    }
  } catch {
    // keep query preparation resilient if autonomy tick fails
  }

  try {
    await tickScheduler();
  } catch {
    // keep query preparation resilient if scheduler tick fails
  }

  const dynamicSystemMessages = await collectDynamicSystemMessages({
    traceId: opts.traceId,
    observabilityService: opts.observabilityService,
    seedMessages: sessionStartHooks.messages,
  });

  let memoryContext: string | null = null;
  if (opts.latestUserInput) {
    const injected = await opts.memoryService.buildInjectionForQuery(opts.latestUserInput);
    if (injected.content) {
      memoryContext = injected.content;
      console.log(
        `\u001b[36m[memory inject]\u001b[0m entries=${injected.usedEntries} tokens=${injected.estimatedTokens}`,
      );
    }
  }

  if (opts.runtimeState.roundsWithoutTodo >= 3) {
    dynamicSystemMessages.push(
      "<reminder>Please call the todo tool to update the task list and maintain progress.</reminder>",
    );
  }

  return {
    ok: true,
    dynamicSystemMessages,
    memoryContext,
  };
}
