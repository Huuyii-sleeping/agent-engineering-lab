import type { WorkflowRunSnapshot, WorkflowRuntimeEvent } from "@orbit/workflow-core";

/** 将单个 SSE 事实合并进 Web 运行快照。 */
export function applyWorkflowRuntimeEvent(run: WorkflowRunSnapshot, event: WorkflowRuntimeEvent): WorkflowRunSnapshot {
  if (event.runId !== run.id) return run;
  if (event.type === "run.status") {
    return {
      ...run,
      status: event.status,
      error: event.error ?? run.error,
      startedAt: event.status === "running" ? run.startedAt ?? event.at : run.startedAt,
      finishedAt: ["succeeded", "failed", "cancelled"].includes(event.status) ? event.at : run.finishedAt,
    };
  }
  if (event.type === "run.output") return { ...run, output: event.output };
  if (event.type === "node.status") {
    const current = run.nodeRuns[event.nodeId] ?? { nodeId: event.nodeId, status: "pending", attempt: 0 };
    return {
      ...run,
      nodeRuns: {
        ...run.nodeRuns,
        [event.nodeId]: {
          ...current,
          status: event.status,
          attempt: event.attempt,
          error: event.error ?? current.error,
          startedAt: event.status === "running" ? current.startedAt ?? event.at : current.startedAt,
          finishedAt: ["succeeded", "failed", "skipped", "cancelled"].includes(event.status) ? event.at : current.finishedAt,
          durationMs: ["succeeded", "failed", "skipped", "cancelled"].includes(event.status) && current.startedAt !== undefined
            ? event.at - current.startedAt
            : current.durationMs,
        },
      },
    };
  }
  if (event.type === "node.output") {
    const current = run.nodeRuns[event.nodeId];
    if (!current) return run;
    return {
      ...run,
      nodeRuns: {
        ...run.nodeRuns,
        [event.nodeId]: { ...current, output: { ...(current.output ?? {}), ...event.output } },
      },
    };
  }
  return run;
}

/** 按事件 id 去重并保持升序，避免 SSE 重连造成 UI 重复日志。 */
export function appendWorkflowRuntimeEvent(events: WorkflowRuntimeEvent[], event: WorkflowRuntimeEvent): WorkflowRuntimeEvent[] {
  if (events.some((item) => item.id === event.id)) return events;
  return [...events, event].sort((left, right) => left.id - right.id);
}
