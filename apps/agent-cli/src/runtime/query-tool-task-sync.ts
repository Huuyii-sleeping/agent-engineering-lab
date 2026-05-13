import type { ObservabilityServiceLike } from "../services/index.js";
import type { ToolServiceLike } from "../tools/service.js";
import { isTodoCompletionRequest, parseTaskIdFromToolOutput } from "./query-tool-results.js";
import type { AgentRuntimeState } from "./query-types.js";

export async function maybeAutoCompleteTaskFromTodo(input: {
  runtimeState: AgentRuntimeState;
  toolName: string;
  toolArgs: Record<string, unknown>;
  traceId: string;
  toolService: ToolServiceLike;
  observabilityService: ObservabilityServiceLike;
}): Promise<boolean> {
  if (input.toolName !== "todo") {
    return false;
  }
  if (!input.runtimeState.activeTaskId || !isTodoCompletionRequest(input.toolArgs)) {
    return true;
  }

  const autoUpdateArgs = JSON.stringify({
    task_id: input.runtimeState.activeTaskId,
    status: "completed",
  });
  console.log(`\u001b[33m$ task_update ${input.runtimeState.activeTaskId} (auto)\u001b[0m`);
  const autoOutput = await input.observabilityService.withExecutionContext(
    { traceId: input.traceId, spanId: input.observabilityService.createSpanId() },
    async () => input.toolService.runToolByName("task_update", autoUpdateArgs),
  );
  console.log(autoOutput);
  input.runtimeState.activeTaskId = null;
  return true;
}

export function syncActiveTaskState(input: {
  runtimeState: AgentRuntimeState;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolOutput: string;
}): void {
  if (input.toolName === "task_create") {
    const createdId = parseTaskIdFromToolOutput(input.toolOutput);
    if (createdId) {
      input.runtimeState.activeTaskId = createdId;
    }
    return;
  }

  if (input.toolName !== "task_update") {
    return;
  }

  const taskId = Number(input.toolArgs.task_id);
  const status = String(input.toolArgs.status ?? "");
  if (input.runtimeState.activeTaskId && taskId === input.runtimeState.activeTaskId && status === "completed") {
    input.runtimeState.activeTaskId = null;
  }
}
