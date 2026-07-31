import type { WorkflowStreamEvent } from "@mastra/core/stream";
import type {
  WorkflowExecutionEventIdentity,
  WorkflowIR,
  WorkflowNodeRunStatus,
  WorkflowRunSnapshot,
  WorkflowRunStatus,
  WorkflowRuntimeError,
  WorkflowWaitingMetadata,
} from "@orbit/workflow-core";
import type { WorkflowRuntimeEventInput } from "../storage/event-journal.js";
import type {
  MastraWorkflowFrame,
  OrbitWorkflowNodeOutputEvent,
} from "../workflows/frame.js";

type ObservedWorkflowStreamEvent = WorkflowStreamEvent extends infer Event
  ? Event extends WorkflowStreamEvent
    ? Omit<Event, "runId" | "from"> & Partial<Pick<Event, "runId" | "from">>
    : never
  : never;

function isFrame(value: unknown): value is MastraWorkflowFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<MastraWorkflowFrame>;
  return typeof frame.productRunId === "string" && Boolean(frame.nodeOutputs) && Boolean(frame.selectedPorts);
}

function productNodeStatus(status: string): WorkflowNodeRunStatus {
  if (status === "success") return "succeeded";
  if (status === "failed" || status === "tripwire" || status === "bailed") return "failed";
  if (status === "suspended" || status === "waiting" || status === "paused") return "waiting";
  if (status === "canceled") return "cancelled";
  if (status === "skipped") return "skipped";
  if (status === "running") return "running";
  return "pending";
}

function productRunStatus(status: string): WorkflowRunStatus {
  if (status === "success") return "succeeded";
  if (status === "failed" || status === "tripwire" || status === "bailed") return "failed";
  if (status === "canceled") return "cancelled";
  if (status === "suspended" || status === "waiting" || status === "paused") return "waiting";
  return "running";
}

function tripwireError(value: unknown, nodeId: string): WorkflowRuntimeError | undefined {
  if (!value || typeof value !== "object") return undefined;
  const tripwire = value as { reason?: unknown; metadata?: unknown };
  return {
    code: "MASTRA_WORKFLOW_TRIPWIRE",
    message: typeof tripwire.reason === "string" ? tripwire.reason : "Mastra Workflow tripwire。",
    nodeId,
    attempt: 1,
    details: tripwire.metadata && typeof tripwire.metadata === "object"
      ? tripwire.metadata as Record<string, unknown>
      : undefined,
  };
}

function reason(value: unknown): string {
  const record = approvalSuspendPayload(value);
  if (!record) return "Mastra Workflow suspended";
  return typeof record.reason === "string" ? record.reason : "Mastra Workflow suspended";
}

function approvalSuspendPayload(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind === "approval") return record;
  return Object.values(record).find((item): item is Record<string, unknown> => (
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
    && (item as Record<string, unknown>).kind === "approval"
  ));
}

function waitingMetadata(value: unknown): WorkflowWaitingMetadata | undefined {
  const record = approvalSuspendPayload(value);
  if (!record) return undefined;
  if (
    record.kind !== "approval"
    || typeof record.interruptId !== "string"
    || typeof record.approvalRequestId !== "string"
    || typeof record.deadline !== "number"
    || !Array.isArray(record.displayFields)
    || !record.displayFields.every((field) => (
      Boolean(field)
      && typeof field === "object"
      && typeof (field as Record<string, unknown>).id === "string"
      && typeof (field as Record<string, unknown>).label === "string"
      && Object.hasOwn(field as object, "value")
    ))
    || !record.decisionSchema
    || typeof record.decisionSchema !== "object"
    || Array.isArray(record.decisionSchema)
  ) return undefined;
  return {
    kind: "approval",
    interruptId: record.interruptId,
    approvalRequestId: record.approvalRequestId,
    deadline: record.deadline,
    displayFields: record.displayFields as WorkflowWaitingMetadata["displayFields"],
    decisionSchema: record.decisionSchema as WorkflowWaitingMetadata["decisionSchema"],
  };
}

function nodeOutput(nodeId: string, value: unknown): Record<string, unknown> | undefined {
  if (isFrame(value)) return value.nodeOutputs[nodeId];
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function nativeLeafStepId(stepId: string): string {
  return stepId.split(".").at(-1) ?? stepId;
}

function eventIdentity(value: unknown, nodeId: string): WorkflowExecutionEventIdentity {
  if (!isFrame(value)) return {};
  const recorded = value.nodeEventIdentities?.[nodeId];
  const executionPath = recorded?.executionPath
    ?? (value.executionPath.at(-1) === nodeId ? value.executionPath : [...value.executionPath, nodeId]);
  return {
    ...((recorded?.containerId ?? value.containerId) === undefined ? {} : { containerId: recorded?.containerId ?? value.containerId }),
    ...((recorded?.instanceId ?? value.instanceId) === undefined ? {} : { instanceId: recorded?.instanceId ?? value.instanceId }),
    ...((recorded?.iterationIndex ?? value.iterationIndex) === undefined ? {} : { iterationIndex: recorded?.iterationIndex ?? value.iterationIndex }),
    ...(executionPath.length === 0 ? {} : { executionPath }),
    ...((recorded?.childRunId ?? value.childRunId) === undefined ? {} : { childRunId: recorded?.childRunId ?? value.childRunId }),
  };
}

type InstanceProgress = {
  nodeId: string;
  identity: WorkflowExecutionEventIdentity;
  status: WorkflowNodeRunStatus;
  output?: Record<string, unknown>;
  error?: WorkflowRuntimeError;
  label: string;
};

function productOutput(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { value };
}

function instanceError(value: unknown, nodeId: string): WorkflowRuntimeError | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = value as { code?: unknown; message?: unknown };
  if (typeof error.code !== "string" || typeof error.message !== "string") return undefined;
  return { code: error.code, message: error.message, nodeId };
}

function instanceProgress(value: unknown): InstanceProgress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result = value as {
    branchId?: unknown;
    index?: unknown;
    instanceId?: unknown;
    status?: unknown;
    output?: unknown;
    error?: unknown;
    frame?: unknown;
  };
  if (!isFrame(result.frame) || !result.frame.containerId) return undefined;
  const instanceId = typeof result.instanceId === "string" ? result.instanceId : result.frame.instanceId;
  if (!instanceId) return undefined;
  const status = result.status === "succeeded"
    ? "succeeded"
    : result.status === "failed"
      ? "failed"
      : result.status === "skipped"
        ? "skipped"
        : undefined;
  if (!status) return undefined;
  const iterationIndex = typeof result.index === "number" ? result.index : result.frame.iterationIndex;
  const label = typeof result.branchId === "string"
    ? `branch ${result.branchId}`
    : iterationIndex === undefined
      ? `instance ${instanceId}`
      : `index ${iterationIndex}`;
  return {
    nodeId: result.frame.containerId,
    identity: {
      containerId: result.frame.containerId,
      instanceId,
      ...(iterationIndex === undefined ? {} : { iterationIndex }),
      executionPath: result.frame.executionPath,
      ...(result.frame.childRunId === undefined ? {} : { childRunId: result.frame.childRunId }),
    },
    status,
    output: status === "succeeded" ? productOutput(result.output) : undefined,
    error: status === "failed" ? instanceError(result.error, result.frame.containerId) : undefined,
    label,
  };
}

/** Mastra Workflow chunk 与最终 snapshot 到产品 WorkflowRuntimeEvent 的唯一映射器。 */
export class MastraWorkflowEventMapper {
  private readonly nativeRunId: string;
  private readonly productNodeIds?: Set<string>;
  private readonly controlStepNodeIds = new Map<string, string>();
  private readonly emitted = new Set<string>();
  private currentNodeId?: string;

  constructor(options: { nativeRunId: string; ir?: WorkflowIR; initialEvents?: WorkflowRuntimeEventInput[] }) {
    this.nativeRunId = options.nativeRunId;
    if (options.ir) {
      this.productNodeIds = new Set();
      const visit = (nodes: WorkflowIR["nodes"]): void => {
        for (const node of nodes) {
          this.productNodeIds!.add(node.id);
          if (node.kind === "parallel") {
            this.controlStepNodeIds.set(`${node.id}-container`, node.id);
            this.controlStepNodeIds.set(`${node.id}-bounded-foreach`, node.id);
            this.controlStepNodeIds.set(`${node.id}-dispatcher`, node.id);
            this.controlStepNodeIds.set(`${node.id}-prepare`, node.id);
            this.controlStepNodeIds.set(`${node.id}-merge-from-initial`, node.merge.nodeId);
            for (const branch of node.branches) visit(branch.graph.nodes);
          }
          if (node.kind === "iteration") {
            this.controlStepNodeIds.set(`${node.id}-container`, node.id);
            this.controlStepNodeIds.set(`${node.id}-bounded-foreach`, node.id);
            this.controlStepNodeIds.set(`${node.id}-prepare`, node.id);
            this.controlStepNodeIds.set(`${node.id}-merge-from-initial`, node.id);
            visit(node.body.nodes);
          }
          if (node.kind === "loop") {
            this.controlStepNodeIds.set(`${node.id}-container`, node.id);
            this.controlStepNodeIds.set(`${node.id}-native-loop`, node.id);
            this.controlStepNodeIds.set(`${node.id}-prepare`, node.id);
            this.controlStepNodeIds.set(`${node.id}-guard`, node.id);
            this.controlStepNodeIds.set(`${node.id}-merge-from-initial`, node.id);
            visit(node.body.nodes);
          }
          if (node.kind === "subworkflow") {
            this.controlStepNodeIds.set(`${node.id}-container`, node.id);
            this.controlStepNodeIds.set(`${node.id}-prepare`, node.id);
            this.controlStepNodeIds.set(`${node.id}-merge-from-initial`, node.id);
            visit(node.workflow.nodes);
          }
        }
      };
      visit(options.ir.nodes);
    }
    this.unique(options.initialEvents ?? []);
  }

  private productNodeId(stepId: string): string | undefined {
    if (!this.productNodeIds) return stepId;
    const leafStepId = nativeLeafStepId(stepId);
    return this.controlStepNodeIds.get(leafStepId)
      ?? (this.productNodeIds.has(leafStepId) ? leafStepId : undefined);
  }

  mapChunk(chunk: ObservedWorkflowStreamEvent): WorkflowRuntimeEventInput[] {
    if (chunk.runId !== undefined && chunk.runId !== this.nativeRunId) {
      throw new Error(`Mastra Workflow runId 不一致：expected ${this.nativeRunId}, received ${chunk.runId}`);
    }
    if (chunk.type === "workflow-start") return this.unique([{ type: "run.status", status: "running" }]);
    if (chunk.type === "workflow-canceled") return this.unique([{ type: "run.status", status: "cancelled" }]);
    if (chunk.type === "workflow-paused") return this.unique([{ type: "run.status", status: "waiting" }]);
    if (chunk.type === "workflow-finish") {
      return this.unique([{ type: "run.status", status: productRunStatus(chunk.payload.workflowStatus) }]);
    }
    if (chunk.type === "workflow-step-start") {
      const nodeId = this.productNodeId(chunk.payload.id);
      if (!nodeId) return [];
      this.currentNodeId = nodeId;
      const identity = eventIdentity(chunk.payload.payload ?? chunk.payload.output, nodeId);
      return this.unique([{
        type: "node.status",
        nodeId,
        status: "running",
        attempt: 1,
        ...identity,
      }]);
    }
    if (chunk.type === "workflow-step-suspended" || chunk.type === "workflow-step-waiting") {
      const nodeId = this.productNodeId(chunk.payload.id);
      if (!nodeId) return [];
      this.currentNodeId = nodeId;
      const suspendPayload = chunk.type === "workflow-step-suspended"
        ? chunk.payload.suspendPayload
        : chunk.payload.payload;
      const identitySource = chunk.type === "workflow-step-suspended"
        ? chunk.payload.output ?? chunk.payload.payload
        : chunk.payload.payload;
      const identity = eventIdentity(identitySource, nodeId);
      return this.unique([
        { type: "node.status", nodeId, status: "waiting", attempt: 1, ...identity },
        {
          type: "run.waiting",
          nodeId,
          reason: reason(suspendPayload),
          ...(waitingMetadata(suspendPayload) ? { waiting: waitingMetadata(suspendPayload) } : {}),
        },
      ]);
    }
    if (chunk.type === "workflow-step-result") {
      const nodeId = this.productNodeId(chunk.payload.id);
      if (!nodeId) return [];
      this.currentNodeId = nodeId;
      const status = productNodeStatus(chunk.payload.status);
      const output = nodeOutput(nodeId, chunk.payload.output);
      const identity = eventIdentity(chunk.payload.output ?? chunk.payload.payload, nodeId);
      return this.unique([
        {
          type: "node.status",
          nodeId,
          status,
          attempt: status === "pending" || status === "skipped" ? 0 : 1,
          error: status === "failed" ? tripwireError(chunk.payload.tripwire, nodeId) : undefined,
          ...identity,
        },
        ...(output ? [{ type: "node.output" as const, nodeId, output, ...identity }] : []),
      ]);
    }
    if (chunk.type === "workflow-step-progress") {
      const progress = instanceProgress(chunk.payload.iterationOutput);
      if (progress) {
        return this.unique([
          {
            type: "node.status",
            nodeId: progress.nodeId,
            status: progress.status,
            attempt: 1,
            error: progress.error,
            ...progress.identity,
          },
          {
            type: "node.log",
            nodeId: progress.nodeId,
            level: progress.status === "failed" ? "error" : "info",
            message: `${progress.label} ${chunk.payload.completedCount}/${chunk.payload.totalCount} ${progress.status}`,
            ...progress.identity,
          },
          ...(progress.output ? [{
            type: "node.output" as const,
            nodeId: progress.nodeId,
            output: progress.output,
            ...progress.identity,
          }] : []),
        ]);
      }
      const nodeId = this.productNodeId(chunk.payload.id);
      if (!nodeId) return [];
      return this.unique([{
        type: "node.log",
        nodeId,
        level: "info",
        message: `Iteration ${chunk.payload.completedCount}/${chunk.payload.totalCount} ${chunk.payload.iterationStatus}`,
      }]);
    }
    if (chunk.type === "workflow-step-output") {
      const nested = chunk.payload.output;
      const stepId = typeof chunk.metadata?.stepId === "string" ? chunk.metadata.stepId : this.currentNodeId;
      const nodeId = stepId ? this.productNodeId(stepId) : undefined;
      if (!nodeId || !nested || typeof nested !== "object") return [];
      const value = nested as { type?: unknown; payload?: unknown };
      const payload = value.payload && typeof value.payload === "object"
        ? value.payload as Record<string, unknown>
        : {};
      const delta = value.type === "text-delta" && typeof payload.text === "string" ? payload.text : undefined;
      return delta ? this.unique([{ type: "node.output", nodeId, output: { delta }, delta }]) : [];
    }
    return [];
  }

  /** 将 typed step 的内部 outputWriter 事件映射为脱敏产品事件。 */
  mapOutput(value: unknown): WorkflowRuntimeEventInput[] {
    if (!value || typeof value !== "object") return [];
    const event = value as Partial<OrbitWorkflowNodeOutputEvent>;
    if (event.type !== "orbit-workflow-node-event" || !event.payload || typeof event.payload !== "object") return [];
    const payload = event.payload;
    if (typeof payload.nodeId !== "string" || (this.productNodeIds && !this.productNodeIds.has(payload.nodeId))) return [];
    const identity: WorkflowExecutionEventIdentity = {
      ...(typeof payload.containerId === "string" ? { containerId: payload.containerId } : {}),
      ...(typeof payload.instanceId === "string" ? { instanceId: payload.instanceId } : {}),
      ...(typeof payload.iterationIndex === "number" ? { iterationIndex: payload.iterationIndex } : {}),
      ...(Array.isArray(payload.executionPath) && payload.executionPath.every((item) => typeof item === "string")
        ? { executionPath: payload.executionPath }
        : {}),
      ...(typeof payload.childRunId === "string" ? { childRunId: payload.childRunId } : {}),
    };
    if (payload.kind === "delta" && typeof payload.delta === "string") {
      return [{ type: "node.output", nodeId: payload.nodeId, output: { delta: payload.delta }, delta: payload.delta, ...identity }];
    }
    if (
      payload.kind === "log"
      && (payload.level === "debug" || payload.level === "info" || payload.level === "warning" || payload.level === "error")
      && typeof payload.message === "string"
    ) {
      return [{ type: "node.log", nodeId: payload.nodeId, level: payload.level, message: payload.message, ...identity }];
    }
    return [];
  }

  mapSnapshotDelta(
    previous: WorkflowRunSnapshot,
    next: WorkflowRunSnapshot,
  ): WorkflowRuntimeEventInput[] {
    const events: WorkflowRuntimeEventInput[] = [];
    for (const [nodeId, node] of Object.entries(next.nodeRuns)) {
      if (previous.nodeRuns[nodeId]?.status === node.status) continue;
      events.push({
        type: "node.status",
        nodeId,
        status: node.status,
        attempt: node.attempt,
        error: node.error,
      });
      if (node.output) events.push({ type: "node.output", nodeId, output: node.output });
    }
    if (next.status === "waiting") {
      const waiting = Object.values(next.nodeRuns).find((node) => node.status === "waiting");
      if (waiting) events.push({
        type: "run.waiting",
        nodeId: waiting.nodeId,
        reason: next.waiting?.reason ?? "Mastra Workflow suspended",
        ...(next.waiting?.waiting ? { waiting: next.waiting.waiting } : {}),
      });
    }
    if (next.status === "succeeded" && next.output) {
      events.push({ type: "run.output", output: next.output });
    }
    events.push({ type: "run.status", status: next.status, error: next.error });
    return this.unique(events);
  }

  private unique(events: WorkflowRuntimeEventInput[]): WorkflowRuntimeEventInput[] {
    return events.filter((event) => {
      const signature = JSON.stringify(event);
      if (this.emitted.has(signature)) return false;
      this.emitted.add(signature);
      return true;
    });
  }
}
