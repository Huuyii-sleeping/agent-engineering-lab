import { randomUUID } from "node:crypto";
import type { WorkflowRuntimeEvent } from "@orbit/workflow-core";
import type { WorkflowSecretProvider } from "./context.js";
import { WorkflowEventStream } from "./events.js";
import type { WorkflowExecutorRegistry } from "./executor-registry.js";
import { WorkflowScheduler } from "./scheduler.js";
import type { StartWorkflowRunInput, WorkflowRun } from "./types.js";

/** 创建 queued 运行快照。 */
export function createWorkflowRun(input: StartWorkflowRunInput, id = randomUUID()): WorkflowRun {
  const source = input.ir.source;
  return {
    id,
    workflowId: source.workflowId,
    versionId: source.kind === "version" ? source.versionId : undefined,
    contentHash: source.kind === "version" ? source.contentHash : undefined,
    mode: input.mode,
    status: "queued",
    createdAt: Date.now(),
    inputs: { ...(input.inputs ?? {}) },
    nodeRuns: Object.fromEntries(input.ir.nodes.map((node) => [node.id, { nodeId: node.id, status: "pending", attempt: 0 }])),
  };
}

/** Agent 进程内的运行控制器；持久化由 BFF 运行索引负责。 */
export class WorkflowRuntime {
  private readonly runs = new Map<string, WorkflowRun>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly streams = new Map<string, WorkflowEventStream>();
  private readonly completions = new Map<string, Promise<WorkflowRun>>();

  constructor(private readonly executors: WorkflowExecutorRegistry, private readonly options: { environment?: Record<string, unknown>; secretProvider?: WorkflowSecretProvider } = {}) {}

  start(input: StartWorkflowRunInput): WorkflowRun {
    const run = createWorkflowRun(input);
    const controller = new AbortController();
    const events = new WorkflowEventStream(run.id);
    this.runs.set(run.id, run);
    this.controllers.set(run.id, controller);
    this.streams.set(run.id, events);
    events.emit({ type: "run.status", status: "queued" });
    const completion = new WorkflowScheduler(this.executors).execute({
      run,
      ir: input.ir,
      events,
      signal: controller.signal,
      targetNodeId: input.targetNodeId,
      nodeInputs: input.nodeInputs,
      environment: this.options.environment,
      secretProvider: this.options.secretProvider,
    }).finally(() => this.controllers.delete(run.id));
    this.completions.set(run.id, completion);
    return run;
  }

  getRun(runId: string): WorkflowRun | undefined {
    return this.runs.get(runId);
  }

  wait(runId: string): Promise<WorkflowRun> {
    const completion = this.completions.get(runId);
    if (!completion) return Promise.reject(new Error(`运行 ${runId} 不存在。`));
    return completion;
  }

  cancel(runId: string): boolean {
    const controller = this.controllers.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  listEvents(runId: string, sinceId = 0): WorkflowRuntimeEvent[] {
    return this.streams.get(runId)?.list(sinceId) ?? [];
  }

  subscribe(runId: string, listener: (event: WorkflowRuntimeEvent) => void): () => void {
    const stream = this.streams.get(runId);
    if (!stream) throw new Error(`运行 ${runId} 不存在。`);
    return stream.subscribe(listener);
  }
}
