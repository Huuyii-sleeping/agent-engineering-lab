import type { WorkflowNodeRunStatus, WorkflowRunStatus, WorkflowRuntimeError, WorkflowRuntimeEvent } from "@orbit/workflow-core";

export type WorkflowRuntimeEventInput =
  | { type: "run.status"; status: WorkflowRunStatus; error?: WorkflowRuntimeError }
  | { type: "node.status"; nodeId: string; status: WorkflowNodeRunStatus; attempt: number; error?: WorkflowRuntimeError }
  | { type: "node.log"; nodeId: string; level: "debug" | "info" | "warning" | "error"; message: string }
  | { type: "node.output"; nodeId: string; output: Record<string, unknown>; delta?: string }
  | { type: "run.output"; output: Record<string, unknown> }
  | { type: "run.waiting"; nodeId: string; reason: string };

/** 单次运行的有序事件流；同步分配 id，异步执行器并发写入时仍严格递增。 */
export class WorkflowEventStream {
  private sequence = 0;
  private readonly events: WorkflowRuntimeEvent[] = [];
  private readonly listeners = new Set<(event: WorkflowRuntimeEvent) => void>();

  constructor(private readonly runId: string) {}

  emit(input: WorkflowRuntimeEventInput): WorkflowRuntimeEvent {
    const event = { ...input, id: ++this.sequence, runId: this.runId, at: Date.now() } as WorkflowRuntimeEvent;
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
    return event;
  }

  list(sinceId = 0): WorkflowRuntimeEvent[] {
    return this.events.filter((event) => event.id > sinceId);
  }

  subscribe(listener: (event: WorkflowRuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
