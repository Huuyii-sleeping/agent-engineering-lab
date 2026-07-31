import type { StartNodeConfig, WorkflowIREdge, WorkflowIR, WorkflowIRNode, WorkflowRuntimeError } from "@orbit/workflow-core";
import { assertWorkflowValueType, WorkflowVariableContext, type WorkflowSecretProvider } from "./context.js";
import type { WorkflowEventStream } from "./events.js";
import type { WorkflowExecutorRegistry, WorkflowExecutorResult } from "./executor-registry.js";
import { transitionNodeStatus, transitionRunStatus } from "./state-machine.js";
import type { WorkflowRun, WorkflowNodeRun } from "./types.js";

type ExecuteSchedulerInput = {
  run: WorkflowRun;
  ir: WorkflowIR;
  events: WorkflowEventStream;
  signal: AbortSignal;
  targetNodeId?: string;
  nodeInputs?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  secretProvider?: WorkflowSecretProvider;
};

function runtimeError(error: unknown, nodeId: string, attempt: number): WorkflowRuntimeError {
  const candidate = error as { code?: unknown; details?: unknown };
  return {
    code: typeof candidate?.code === "string" ? candidate.code : "WORKFLOW_NODE_FAILED",
    message: error instanceof Error ? error.message : String(error),
    nodeId,
    attempt,
    details: candidate?.details && typeof candidate.details === "object" ? candidate.details as Record<string, unknown> : undefined,
  };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("运行已取消。")); }, { once: true });
  });
}

async function executeWithTimeout<T>(action: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parentSignal: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(controller.signal),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error(`节点执行超过 ${timeoutMs}ms。`), { code: "WORKFLOW_NODE_TIMEOUT" })); }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal.removeEventListener("abort", onAbort);
  }
}

function assignInput(target: Record<string, unknown>, portId: string, value: unknown): void {
  const current = target[portId];
  target[portId] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  if (portId === "in" && value && typeof value === "object" && !Array.isArray(value)) Object.assign(target, value);
}

/** Runtime MVP 的确定性顺序调度器。 */
export class WorkflowScheduler {
  constructor(private readonly executors: WorkflowExecutorRegistry) {}

  async execute(input: ExecuteSchedulerInput): Promise<WorkflowRun> {
    const { run, ir, events, signal } = input;
    const selectedPorts = new Map<string, Set<string>>();
    const variables = new WorkflowVariableContext({
      inputs: run.inputs,
      system: { runId: run.id, currentTime: new Date(run.createdAt).toISOString() },
      environment: input.environment,
      secretProvider: input.secretProvider,
    });

    if (signal.aborted) return this.cancelRemaining(run, ir, events);
    this.setRunStatus(run, "running", events);
    run.startedAt = Date.now();
    const inputError = input.targetNodeId ? undefined : this.validateInputs(ir, run.inputs);
    if (inputError) {
      run.error = inputError;
      this.setRunStatus(run, "failed", events, inputError);
      run.finishedAt = Date.now();
      return run;
    }
    const orderedNodes = input.targetNodeId ? ir.nodes.filter((node) => node.id === input.targetNodeId) : ir.topology.orderedNodeIds.map((id) => ir.nodes.find((node) => node.id === id)!).filter(Boolean);

    for (const node of orderedNodes) {
      if (signal.aborted) return this.cancelRemaining(run, ir, events);
      const nodeRun = run.nodeRuns[node.id];
      if (node.disabled) {
        this.setNodeStatus(nodeRun, "skipped", events, run.id);
        continue;
      }
      const nodeInputs = input.targetNodeId === node.id ? { ...(input.nodeInputs ?? {}) } : this.collectInputs(node, ir, run, variables, selectedPorts);
      const incoming = ir.edges.filter((edge) => edge.targetNodeId === node.id);
      if (!input.targetNodeId && incoming.length > 0 && Object.keys(nodeInputs).length === 0) {
        this.setNodeStatus(nodeRun, "skipped", events, run.id);
        continue;
      }
      if (node.type === "start") Object.assign(nodeInputs, run.inputs);
      this.setNodeStatus(nodeRun, "ready", events, run.id);
      this.setNodeStatus(nodeRun, "running", events, run.id);
      nodeRun.startedAt = Date.now();
      nodeRun.input = nodeInputs;

      const execution = await this.executeNode(node, nodeInputs, variables, run, nodeRun, events, signal);
      if (execution.kind === "cancelled") return this.cancelRemaining(run, ir, events);
      if (execution.kind === "failed") {
        run.error = execution.error;
        this.setRunStatus(run, "failed", events, execution.error);
        run.finishedAt = Date.now();
        return run;
      }
      variables.setNodeOutput(node.id, execution.result.outputs);
      nodeRun.output = execution.result.outputs;
      selectedPorts.set(node.id, new Set(execution.result.selectedPortIds ?? []));
      events.emit({ type: "node.output", nodeId: node.id, output: execution.result.outputs });
      if (node.type === "end") run.output = execution.result.outputs;
    }

    run.output ??= {};
    events.emit({ type: "run.output", output: run.output });
    this.setRunStatus(run, "succeeded", events);
    run.finishedAt = Date.now();
    return run;
  }

  private collectInputs(node: WorkflowIRNode, ir: WorkflowIR, run: WorkflowRun, variables: WorkflowVariableContext, selectedPorts: Map<string, Set<string>>): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};
    for (const edge of ir.edges.filter((candidate) => candidate.targetNodeId === node.id)) {
      if (!this.isEdgeActive(edge, run, selectedPorts)) continue;
      const sourceOutput = variables.getNodeOutput(edge.sourceNodeId);
      const value = sourceOutput?.[edge.sourcePortId] ?? sourceOutput?.value ?? sourceOutput ?? true;
      assignInput(inputs, edge.targetPortId, value);
    }
    return inputs;
  }

  private validateInputs(ir: WorkflowIR, inputs: Record<string, unknown>): WorkflowRuntimeError | undefined {
    const start = ir.nodes.find((node) => node.type === "start");
    if (!start) return { code: "WORKFLOW_INPUT_INVALID", message: "工作流缺少 Start 节点。" };
    const config = start.config as StartNodeConfig;
    try {
      for (const field of config.inputs) {
        const value = inputs[field.id];
        if (value === undefined && field.required && field.defaultValue === undefined) throw new Error(`缺少必填工作流输入 ${field.name}。`);
        if (value !== undefined) assertWorkflowValueType(field.name, field.dataType, value);
      }
      return undefined;
    } catch (error) {
      return { code: "WORKFLOW_INPUT_INVALID", message: error instanceof Error ? error.message : String(error) };
    }
  }

  private isEdgeActive(edge: WorkflowIREdge, run: WorkflowRun, selectedPorts: Map<string, Set<string>>): boolean {
    const sourceRun = run.nodeRuns[edge.sourceNodeId];
    if (!sourceRun || sourceRun.status === "skipped" || sourceRun.status === "cancelled") return false;
    if (sourceRun.status === "failed" && !sourceRun.handledError) return false;
    const selected = selectedPorts.get(edge.sourceNodeId);
    return !selected || selected.size === 0 || selected.has(edge.sourcePortId);
  }

  private async executeNode(node: WorkflowIRNode, nodeInputs: Record<string, unknown>, variables: WorkflowVariableContext, run: WorkflowRun, nodeRun: WorkflowNodeRun, events: WorkflowEventStream, signal: AbortSignal): Promise<{ kind: "success"; result: WorkflowExecutorResult } | { kind: "failed"; error: WorkflowRuntimeError } | { kind: "cancelled" }> {
    const executor = this.executors.require(node.executor);
    const maxAttempts = node.execution.idempotent ? node.execution.maxAttempts : 1;
    let lastError: WorkflowRuntimeError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      nodeRun.attempt = attempt;
      events.emit({ type: "node.status", nodeId: node.id, status: "running", attempt });
      try {
        const result = await executeWithTimeout((nodeSignal) => executor.execute({
          runId: run.id,
          node,
          inputs: nodeInputs,
          variables,
          signal: nodeSignal,
          emitLog: (level, message) => { events.emit({ type: "node.log", nodeId: node.id, level, message }); },
          emitDelta: (delta) => { events.emit({ type: "node.output", nodeId: node.id, output: {}, delta }); },
        }), node.execution.timeoutMs, signal);
        for (const port of node.ports.outputs) if (result.outputs[port.id] !== undefined) assertWorkflowValueType(`${node.id}.${port.id}`, port.dataType, result.outputs[port.id]);
        nodeRun.finishedAt = Date.now();
        nodeRun.durationMs = nodeRun.finishedAt - (nodeRun.startedAt ?? nodeRun.finishedAt);
        this.setNodeStatus(nodeRun, "succeeded", events, run.id);
        return { kind: "success", result };
      } catch (error) {
        if (signal.aborted) {
          this.setNodeStatus(nodeRun, "cancelled", events, run.id);
          return { kind: "cancelled" };
        }
        lastError = runtimeError(error, node.id, attempt);
        events.emit({ type: "node.log", nodeId: node.id, level: "error", message: lastError.message });
        if (attempt < maxAttempts) await delay(node.execution.retryBackoffMs, signal);
      }
    }
    const error = lastError ?? runtimeError("节点执行失败。", node.id, nodeRun.attempt);
    nodeRun.error = error;
    nodeRun.finishedAt = Date.now();
    nodeRun.durationMs = nodeRun.finishedAt - (nodeRun.startedAt ?? nodeRun.finishedAt);
    if (node.execution.onError === "default") {
      nodeRun.output = node.execution.defaultOutput ?? {};
      this.setNodeStatus(nodeRun, "succeeded", events, run.id);
      return { kind: "success", result: { outputs: nodeRun.output } };
    }
    this.setNodeStatus(nodeRun, "failed", events, run.id, error);
    if (node.execution.onError === "route" && node.execution.errorPortId) {
      nodeRun.handledError = true;
      return { kind: "success", result: { outputs: { error }, selectedPortIds: [node.execution.errorPortId] } };
    }
    return { kind: "failed", error };
  }

  private setRunStatus(run: WorkflowRun, status: WorkflowRun["status"], events: WorkflowEventStream, error?: WorkflowRuntimeError): void {
    run.status = transitionRunStatus(run.status, status);
    events.emit({ type: "run.status", status, error });
  }

  private setNodeStatus(nodeRun: WorkflowNodeRun, status: WorkflowNodeRun["status"], events: WorkflowEventStream, runId: string, error?: WorkflowRuntimeError): void {
    nodeRun.status = transitionNodeStatus(nodeRun.status, status);
    events.emit({ type: "node.status", nodeId: nodeRun.nodeId, status, attempt: nodeRun.attempt, error });
  }

  private cancelRemaining(run: WorkflowRun, ir: WorkflowIR, events: WorkflowEventStream): WorkflowRun {
    for (const node of ir.nodes) {
      const nodeRun = run.nodeRuns[node.id];
      if (nodeRun.status === "pending" || nodeRun.status === "ready" || nodeRun.status === "running" || nodeRun.status === "waiting") {
        nodeRun.status = transitionNodeStatus(nodeRun.status, "cancelled");
        events.emit({ type: "node.status", nodeId: node.id, status: "cancelled", attempt: nodeRun.attempt });
      }
    }
    if (run.status === "queued" || run.status === "running" || run.status === "waiting") {
      run.status = transitionRunStatus(run.status, "cancelled");
      events.emit({ type: "run.status", status: "cancelled" });
    }
    run.finishedAt = Date.now();
    return run;
  }
}
