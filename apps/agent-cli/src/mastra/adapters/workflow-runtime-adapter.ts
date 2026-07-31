import { createHash, randomUUID } from "node:crypto";
import {
  RuntimePortError,
  type CancelWorkflowRunCommand,
  type ResumeWorkflowRunCommand,
  type StartWorkflowRunCommand,
  type WorkflowRuntimeCapabilities,
  type WorkflowRuntimeEventQuery,
  type WorkflowRuntimePort,
} from "@orbit/runtime-contracts";
import {
  DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES,
  isTerminalWorkflowRunStatus,
  isWorkflowVersion,
  normalizeWorkflowStageECapabilities,
  projectWorkflowRuntimeEvents,
  requiredWorkflowStageECapabilities,
  stableSerialize,
  validateWorkflowJsonSchema,
  type AgentVersion,
  type StartNodeConfig,
  type WorkflowIR,
  type WorkflowRunSnapshot,
  type WorkflowRuntimeEvent,
  type WorkflowStageECapabilityRegistry,
  type WorkflowWaitingMetadata,
} from "@orbit/workflow-core";
import { getWorkflowSuspendedSteps, type AnyWorkflow } from "@mastra/core/workflows";
import { assertWorkflowValueType } from "../../workflows/context.js";
import { compileWorkflowForRuntime } from "../../workflows/compiler-adapter.js";
import { AsyncEventQueue } from "../../runtime/async-event-queue.js";
import { OrbitRuntimeEventJournal } from "../storage/event-journal.js";
import { MastraRunMappingRepository } from "../storage/run-mapping-repository.js";
import {
  MastraWorkflowRunRepository,
  type StoredMastraWorkflowRun,
} from "../storage/workflow-run-repository.js";
import {
  MASTRA_WORKFLOW_ADAPTER_VERSION,
  MastraWorkflowCompilerAdapter,
} from "../workflows/compiler-adapter.js";
import { createMastraWorkflowFrame } from "../workflows/frame.js";
import {
  cancelledWorkflowSnapshot,
  mapMastraWorkflowResult,
  safeWorkflowRequestContext,
  type NativeWorkflowResult,
} from "./workflow-result-mapper.js";
import { MastraWorkflowEventMapper } from "./workflow-event-mapper.js";

type NativeRun = Awaited<ReturnType<AnyWorkflow["createRun"]>>;

type AdapterOptions = {
  compiler: MastraWorkflowCompilerAdapter;
  root?: string;
  persistenceEnabled?: boolean;
  productRunId?: () => string;
  nativeRunId?: () => string;
  runMappings?: MastraRunMappingRepository;
  journal?: OrbitRuntimeEventJournal;
  runs?: MastraWorkflowRunRepository;
  stageECapabilities?: Partial<WorkflowStageECapabilityRegistry>;
};

type ActiveWorkflowRun = {
  native: NativeRun;
  completion: Promise<WorkflowRunSnapshot>;
  cancelRequested: boolean;
  interruptDecision?: {
    interruptId: string;
    idempotencyKey: string;
    decisionHash: string;
  };
};

type NativeEventObserver = {
  close(): Promise<void>;
};

function approvalSuspendPayload(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind === "approval") return record;
  return Object.values(record).find((item): item is Record<string, unknown> => (
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
    && (item as Record<string, unknown>).kind === "approval"
  ));
}

function waitingMetadataFromPayload(value: unknown): WorkflowWaitingMetadata | undefined {
  const payload = approvalSuspendPayload(value);
  if (
    !payload
    || typeof payload.interruptId !== "string"
    || typeof payload.approvalRequestId !== "string"
    || typeof payload.deadline !== "number"
    || !Array.isArray(payload.displayFields)
    || !payload.decisionSchema
    || typeof payload.decisionSchema !== "object"
    || Array.isArray(payload.decisionSchema)
  ) return undefined;
  return {
    kind: "approval",
    interruptId: payload.interruptId,
    approvalRequestId: payload.approvalRequestId,
    deadline: payload.deadline,
    displayFields: payload.displayFields as WorkflowWaitingMetadata["displayFields"],
    decisionSchema: payload.decisionSchema as WorkflowWaitingMetadata["decisionSchema"],
  };
}

/** 将 Mastra Workflow 执行、snapshot 和 stream journal 翻译为 WorkflowRuntimePort。 */
export class MastraWorkflowRuntimeAdapter implements WorkflowRuntimePort {
  private readonly compiler: MastraWorkflowCompilerAdapter;
  private readonly productRunId: () => string;
  private readonly nativeRunId: () => string;
  private readonly runMappings: MastraRunMappingRepository;
  private readonly journal: OrbitRuntimeEventJournal;
  private readonly runs: MastraWorkflowRunRepository;
  private readonly stageECapabilities: WorkflowStageECapabilityRegistry;
  private readonly active = new Map<string, ActiveWorkflowRun>();
  private readonly controlQueues = new Map<string, Promise<void>>();

  constructor(options: AdapterOptions) {
    this.compiler = options.compiler;
    this.productRunId = options.productRunId ?? randomUUID;
    this.nativeRunId = options.nativeRunId ?? randomUUID;
    const repositoryOptions = { root: options.root, persistenceEnabled: options.persistenceEnabled };
    this.runMappings = options.runMappings ?? new MastraRunMappingRepository(repositoryOptions);
    this.journal = options.journal ?? new OrbitRuntimeEventJournal(repositoryOptions);
    this.runs = options.runs ?? new MastraWorkflowRunRepository(repositoryOptions);
    this.stageECapabilities = options.stageECapabilities
      ? normalizeWorkflowStageECapabilities(options.stageECapabilities)
      : DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES;
  }

  capabilities(): Promise<WorkflowRuntimeCapabilities> {
    return Promise.resolve({
      start: true,
      query: true,
      cancel: true,
      events: true,
      eventReplay: true,
      resume: true,
      snapshots: true,
      restartRecovery: true,
      stageE: this.stageECapabilities,
    });
  }

  async start(command: StartWorkflowRunCommand): Promise<WorkflowRunSnapshot> {
    this.assertMode(command);
    this.assertStageECapabilities(command);
    const ir = this.compileCommand(command);
    this.assertCommand(command, ir);
    const productRunId = command.runId ?? this.productRunId();
    const nativeRunId = this.nativeRunId();
    const compiled = this.compiler.compile(ir, { targetNodeId: command.targetNodeId });
    const native = await compiled.workflow.createRun({ runId: nativeRunId });
    const now = Date.now();
    const snapshot = this.initialSnapshot(productRunId, nativeRunId, command, ir, now);
    const record: StoredMastraWorkflowRun = {
      snapshot,
      nativeRunId,
      runtimeWorkflowId: compiled.runtimeWorkflowId,
      ir,
      agentDependencies: command.agentDependencies?.map((version) => structuredClone(version)),
      targetNodeId: command.targetNodeId,
      nodeInputs: command.nodeInputs,
      ownerId: typeof command.requestContext?.ownerId === "string" ? command.requestContext.ownerId : undefined,
    };
    await this.runMappings.bind({
      domain: "workflow",
      productRunId,
      mastraRunId: nativeRunId,
      adapterVersion: MASTRA_WORKFLOW_ADAPTER_VERSION,
    });
    await this.runs.create(record);
    await this.journal.appendWorkflow(productRunId, { type: "run.status", status: "running" });
    const completion = this.executeStart(record, native, {
      ...safeWorkflowRequestContext(command.requestContext),
      ...(record.agentDependencies?.length ? { __workflowAgentVersions: record.agentDependencies } : {}),
    });
    this.active.set(productRunId, { native, completion, cancelRequested: false });
    void completion.catch(() => undefined);
    return snapshot;
  }

  async get(runId: string): Promise<WorkflowRunSnapshot | null> {
    await this.cleanupExpiredTechnicalState();
    const record = await this.runs.get(runId);
    if (!record) return null;
    const snapshot = await this.enrichWaitingSnapshot(record, record.snapshot);
    if (snapshot !== record.snapshot) await this.runs.update({ ...record, snapshot });
    if (
      snapshot.status === "waiting"
      && snapshot.waiting?.waiting?.kind === "approval"
      && snapshot.waiting.waiting.deadline <= Date.now()
    ) {
      return this.expireWaitingRun({ ...record, snapshot }, snapshot);
    }
    return this.projectSnapshot(snapshot);
  }

  async cancel(command: CancelWorkflowRunCommand): Promise<WorkflowRunSnapshot> {
    const setup = await this.withRunControl(command.runId, async () => {
      const record = await this.requireRecord(command.runId);
      if (isTerminalWorkflowRunStatus(record.snapshot.status)) {
        throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", `Workflow run ${command.runId} 已处于终态。`);
      }
      const active = this.active.get(command.runId);
      if (active) {
        active.cancelRequested = true;
        await active.native.cancel();
        return { completion: active.completion };
      }
      const native = await this.restoreNativeRun(record);
      await native.cancel();
      const cancelled = cancelledWorkflowSnapshot(record.snapshot);
      await this.finishRecord(record, cancelled);
      await this.emitSnapshotDelta(record.snapshot, cancelled);
      const projected = await this.projectSnapshot(cancelled);
      await this.finishRecord(record, projected);
      return { completion: Promise.resolve(projected) };
    });
    return setup.completion;
  }

  events(query: WorkflowRuntimeEventQuery): AsyncIterable<WorkflowRuntimeEvent> {
    return this.observeAfterMaintenance(query.runId, query.sinceId ?? 0);
  }

  async resume(command: ResumeWorkflowRunCommand): Promise<WorkflowRunSnapshot> {
    const setup = await this.withRunControl(command.runId, async () => {
      const record = await this.requireRecord(command.runId);
      const decision = this.interruptDecision(command);
      const active = this.active.get(command.runId);
      if (active) {
        if (decision && stableSerialize(active.interruptDecision) === stableSerialize(decision)) {
          return { completion: active.completion };
        }
        throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", `Workflow run ${command.runId} 正在处理其他控制命令。`);
      }
      if (isTerminalWorkflowRunStatus(record.snapshot.status)) {
        if (decision && this.matchesReceipt(record, decision)) {
          return { completion: Promise.resolve(await this.projectSnapshot(record.snapshot)) };
        }
        throw new RuntimePortError(
          "RUNTIME_TERMINAL_CONFLICT",
          `Workflow run ${command.runId} 当前状态 ${record.snapshot.status} 不可恢复。`,
        );
      }
      if (record.snapshot.status !== "waiting") {
        throw new RuntimePortError(
          "RUNTIME_TERMINAL_CONFLICT",
          `Workflow run ${command.runId} 当前状态 ${record.snapshot.status} 不可恢复。`,
        );
      }
      const productStepId = command.stepId ?? record.snapshot.waiting?.nodeId;
      const resumeStep = await this.nativeResumeStep(record, productStepId);
      const effectiveResumeData = await this.assertInterruptResume(record, command, resumeStep, productStepId);
      const receipt = this.interruptDecision(command);
      if (receipt) {
        const claim = await this.runs.claimInterruptDecision({ runId: command.runId, ...receipt });
        if (claim === "conflict") {
          throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", "Human Approval 决定与已登记的 run-scoped 幂等回执冲突。");
        }
        const currentActive = this.active.get(command.runId);
        if (currentActive) return { completion: currentActive.completion };
      }
      const claimedRecord = receipt ? await this.requireRecord(command.runId) : record;
      const native = await this.restoreNativeRun(claimedRecord);
      const runningRecord: StoredMastraWorkflowRun = {
        ...claimedRecord,
        snapshot: { ...claimedRecord.snapshot, status: "running", finishedAt: undefined },
      };
      await this.journal.appendWorkflow(command.runId, { type: "run.status", status: "running" });
      const effectiveCommand: ResumeWorkflowRunCommand = {
        ...command,
        stepId: productStepId,
        resumeData: effectiveResumeData,
      };
      const completion = this.executeResume(runningRecord, native, effectiveCommand, resumeStep);
      this.active.set(command.runId, {
        native,
        completion,
        cancelRequested: false,
        ...(receipt ? { interruptDecision: receipt } : {}),
      });
      void completion.catch(() => undefined);
      return { completion };
    });
    return setup.completion;
  }

  private async executeStart(
    record: StoredMastraWorkflowRun,
    native: NativeRun,
    requestContext: Record<string, unknown>,
  ): Promise<WorkflowRunSnapshot> {
    const mapper = this.eventMapper(record);
    const observer = await this.observeNative(record.snapshot.id, native, mapper);
    try {
      const result = await native.start({
        inputData: createMastraWorkflowFrame({
          productRunId: record.snapshot.id,
          nativeRunId: record.nativeRunId,
          workflowVersionId: record.snapshot.versionId,
          workflowInputs: record.snapshot.inputs,
          nodeInputs: record.nodeInputs,
          targetNodeId: record.targetNodeId,
          requestContext,
        }),
        outputWriter: async (output) => {
          for (const event of mapper.mapOutput(output)) await this.journal.appendWorkflow(record.snapshot.id, event);
        },
      });
      await observer.close();
      return await this.finishNativeResult(
        record,
        result as NativeWorkflowResult,
        this.active.get(record.snapshot.id)?.cancelRequested === true,
        mapper,
      );
    } catch (error) {
      let failure = error;
      try {
        await observer.close();
      } catch (observerError) {
        failure = observerError;
      }
      const cancelled = this.active.get(record.snapshot.id)?.cancelRequested === true;
      return this.finishNativeResult(record, {
        status: cancelled ? "canceled" : "failed",
        error: failure,
      }, cancelled, mapper);
    } finally {
      this.active.delete(record.snapshot.id);
    }
  }

  private async executeResume(
    record: StoredMastraWorkflowRun,
    native: NativeRun,
    command: ResumeWorkflowRunCommand,
    resumeStep: string | string[] | undefined,
  ): Promise<WorkflowRunSnapshot> {
    const mapper = this.eventMapper(record);
    const observer = await this.observeNative(record.snapshot.id, native, mapper);
    try {
      const result = await native.resume({
        step: resumeStep,
        resumeData: command.resumeData,
        forEachIndex: command.forEachIndex,
        outputWriter: async (output) => {
          for (const event of mapper.mapOutput(output)) await this.journal.appendWorkflow(record.snapshot.id, event);
        },
      });
      await observer.close();
      return this.finishNativeResult(
        record,
        result as NativeWorkflowResult,
        this.active.get(command.runId)?.cancelRequested === true,
        mapper,
      );
    } catch (error) {
      let failure = error;
      try {
        await observer.close();
      } catch (observerError) {
        failure = observerError;
      }
      const cancelled = this.active.get(command.runId)?.cancelRequested === true;
      return this.finishNativeResult(record, {
        status: cancelled ? "canceled" : "failed",
        error: failure,
      }, cancelled, mapper);
    } finally {
      this.active.delete(command.runId);
    }
  }

  private async finishNativeResult(
    record: StoredMastraWorkflowRun,
    result: NativeWorkflowResult,
    cancelled: boolean,
    mapper: MastraWorkflowEventMapper,
  ): Promise<WorkflowRunSnapshot> {
    const previous = record.snapshot;
    const mapped = mapMastraWorkflowResult(record, result, cancelled);
    const snapshot = await this.enrichWaitingSnapshot(record, mapped);
    await this.finishRecord(record, snapshot);
    await this.emitSnapshotDelta(previous, snapshot, mapper);
    const projected = await this.projectSnapshot(snapshot);
    await this.finishRecord(record, projected);
    return projected;
  }

  private async finishRecord(record: StoredMastraWorkflowRun, snapshot: WorkflowRunSnapshot): Promise<void> {
    await this.runs.update({ ...record, snapshot });
  }

  private async projectSnapshot(snapshot: WorkflowRunSnapshot): Promise<WorkflowRunSnapshot> {
    return projectWorkflowRuntimeEvents(snapshot, await this.journal.listWorkflow(snapshot.id));
  }

  private async emitSnapshotDelta(
    previous: WorkflowRunSnapshot,
    next: WorkflowRunSnapshot,
    mapper = new MastraWorkflowEventMapper({ nativeRunId: "snapshot-only" }),
  ): Promise<void> {
    for (const event of mapper.mapSnapshotDelta(previous, next)) {
      await this.journal.appendWorkflow(next.id, event);
    }
  }

  private eventMapper(record: StoredMastraWorkflowRun): MastraWorkflowEventMapper {
    return new MastraWorkflowEventMapper({
      nativeRunId: record.nativeRunId,
      ir: record.ir,
      initialEvents: [{ type: "run.status", status: "running" }],
    });
  }

  private async observeNative(
    runId: string,
    native: NativeRun,
    mapper: MastraWorkflowEventMapper,
  ): Promise<NativeEventObserver> {
    let pending = Promise.resolve();
    let closed = false;
    const unsubscribe = await native.watchAsync((chunk) => {
      pending = pending.then(async () => {
        for (const event of mapper.mapChunk(chunk)) await this.journal.appendWorkflow(runId, event);
      });
    });
    return {
      async close() {
        if (!closed) {
          closed = true;
          unsubscribe();
        }
        await pending;
      },
    };
  }

  private initialSnapshot(
    runId: string,
    nativeRunId: string,
    command: StartWorkflowRunCommand,
    ir: WorkflowIR,
    now: number,
  ): WorkflowRunSnapshot {
    return {
      id: runId,
      workflowId: ir.source.workflowId,
      versionId: ir.source.kind === "version" ? ir.source.versionId : undefined,
      contentHash: ir.source.kind === "version" ? ir.source.contentHash : undefined,
      mode: command.mode,
      status: "running",
      createdAt: now,
      startedAt: now,
      inputs: command.inputs ?? {},
      nodeRuns: Object.fromEntries(ir.nodes.map((node) => [
        node.id,
        { nodeId: node.id, status: "pending", attempt: 0 },
      ])),
      runtimeBackend: "mastra",
      adapterVersion: command.runtimeBinding?.adapterVersion ?? MASTRA_WORKFLOW_ADAPTER_VERSION,
      nativeRunId,
      runtimeVersion: command.runtimeBinding?.runtimeVersion,
      selectionReason: command.runtimeBinding?.selectionReason,
      verifiedCapabilities: command.runtimeBinding?.verifiedCapabilities,
    };
  }

  private assertMode(command: StartWorkflowRunCommand): void {
    if (command.mode === "production" && !isWorkflowVersion(command.workflow)) {
      throw new RuntimePortError("RUNTIME_CAPABILITY_UNSUPPORTED", "production 运行必须使用不可变发布版本。");
    }
    if (command.mode === "node-test" && !command.targetNodeId) {
      throw new RuntimePortError("RUNTIME_CAPABILITY_UNSUPPORTED", "node-test 运行必须指定 targetNodeId。");
    }
  }

  private assertStageECapabilities(command: StartWorkflowRunCommand): void {
    const definitions = [command.workflow, ...(command.workflowDependencies ?? [])];
    const required = new Set([
      ...requiredWorkflowStageECapabilities(definitions.flatMap((definition) => definition.nodes)),
      ...(command.requiredRuntimeCapabilities ?? []),
    ]);
    const baseCapabilities = new Set([
      "start",
      "query",
      "cancel",
      "events",
      "eventReplay",
      "resume",
      "snapshots",
      "restartRecovery",
    ]);
    const unsupported = [...required].filter((capability) => (
      !baseCapabilities.has(capability)
      && this.stageECapabilities[capability as keyof WorkflowStageECapabilityRegistry] !== true
    ));
    if (unsupported.length > 0) {
      throw new RuntimePortError(
        "RUNTIME_CAPABILITY_UNSUPPORTED",
        `Workflow 所需生产能力尚未开放：${unsupported.sort().join(", ")}。`,
        { capabilities: unsupported.sort() },
      );
    }
  }

  private compileCommand(command: StartWorkflowRunCommand): WorkflowIR {
    const versions = new Map<string, NonNullable<StartWorkflowRunCommand["workflowDependencies"]>[number]>();
    const add = (version: NonNullable<StartWorkflowRunCommand["workflowDependencies"]>[number]): void => {
      if (!isWorkflowVersion(version)) {
        throw new RuntimePortError("RUNTIME_CAPABILITY_UNSUPPORTED", "Subworkflow dependency 必须是不可变 WorkflowVersion。");
      }
      const key = `${version.workflowId}:${version.id}`;
      const current = versions.get(key);
      if (current && current.contentHash !== version.contentHash) {
        throw new RuntimePortError("RUNTIME_CAPABILITY_UNSUPPORTED", `Subworkflow dependency ${key} 存在冲突版本。`);
      }
      versions.set(key, version);
    };
    if (isWorkflowVersion(command.workflow)) add(command.workflow);
    for (const version of command.workflowDependencies ?? []) add(version);
    const agentVersions = new Map<string, AgentVersion>();
    for (const version of command.agentDependencies ?? []) {
      const key = `${version.agentProfileId}:${version.id}`;
      const current = agentVersions.get(key);
      if (current && stableSerialize(current) !== stableSerialize(version)) {
        throw new RuntimePortError("RUNTIME_CAPABILITY_UNSUPPORTED", `Agent dependency ${key} 存在冲突版本。`);
      }
      agentVersions.set(key, version);
    }
    const approvalPolicyIds = new Set(command.approvalPolicyIds ?? []);
    return compileWorkflowForRuntime(command.workflow, {
      ...(versions.size === 0 ? {} : {
        workflowVersions: {
          resolvePublishedVersion: (workflowId: string, versionId: string) => versions.get(`${workflowId}:${versionId}`),
        },
      }),
      ...(agentVersions.size === 0 ? {} : {
        agentVersions: {
          resolvePublishedVersion: (agentProfileId: string, agentVersionId: string) => agentVersions.get(`${agentProfileId}:${agentVersionId}`),
        },
      }),
      ...(approvalPolicyIds.size === 0 ? {} : {
        approvalPolicies: { hasPolicy: (policyId: string) => approvalPolicyIds.has(policyId) },
      }),
    });
  }

  private assertCommand(command: StartWorkflowRunCommand, ir: WorkflowIR): void {
    if (command.targetNodeId && !ir.nodes.some((node) => node.id === command.targetNodeId)) {
      throw new RuntimePortError("RUNTIME_NOT_FOUND", `Workflow 节点 ${command.targetNodeId} 不存在。`);
    }
    if (ir.nodes.some((node) => node.type === "tool") && typeof command.requestContext?.ownerId !== "string") {
      throw new RuntimePortError("RUNTIME_OWNERSHIP_CONFLICT", "包含 Tool 节点的 Workflow 必须提供 ownerId。");
    }
    if (command.mode === "node-test") return;
    const start = ir.nodes.find((node) => node.type === "start");
    if (!start) throw new RuntimePortError("RUNTIME_CAPABILITY_UNSUPPORTED", "Workflow 缺少 Start 节点。");
    const config = start.config as StartNodeConfig;
    for (const field of config.inputs) {
      const value = command.inputs?.[field.id] ?? field.defaultValue;
      if (value === undefined && field.required) {
        throw new RuntimePortError("RUNTIME_CAPABILITY_UNSUPPORTED", `缺少必填工作流输入 ${field.name}。`);
      }
      if (value !== undefined) assertWorkflowValueType(field.name, field.dataType, value);
    }
  }

  private async requireRecord(runId: string): Promise<StoredMastraWorkflowRun> {
    const record = await this.runs.get(runId);
    if (!record) throw new RuntimePortError("RUNTIME_NOT_FOUND", `Workflow run ${runId} 不存在。`);
    return record;
  }

  private async restoreNativeRun(record: StoredMastraWorkflowRun): Promise<NativeRun> {
    const compiled = this.compiler.compile(record.ir, { targetNodeId: record.targetNodeId });
    return compiled.workflow.createRun({ runId: record.nativeRunId });
  }

  private async nativeResumeStep(
    record: StoredMastraWorkflowRun,
    productStepId: string | undefined,
  ): Promise<string | string[] | undefined> {
    if (!productStepId) return undefined;
    const node = record.ir.nodes.find((candidate) => candidate.id === productStepId);
    if (!node) return productStepId;
    if (node.kind === "subworkflow") {
      const compiled = this.compiler.compile(record.ir, { targetNodeId: record.targetNodeId });
      const state = await compiled.workflow.getWorkflowRunById(record.nativeRunId, { withNestedWorkflows: true });
      const containerId = `${node.id}-container`;
      const suspended = state
        ? getWorkflowSuspendedSteps(state).find((item) => item.path[0] === containerId || item.path.includes(containerId))
        : undefined;
      return suspended?.path ?? containerId;
    }
    return node.kind === "loop" || node.kind === "iteration" || node.kind === "parallel"
      ? `${node.id}-container`
      : productStepId;
  }

  private interruptDecision(
    command: ResumeWorkflowRunCommand,
  ): { interruptId: string; idempotencyKey: string; decisionHash: string } | undefined {
    const interrupt = command.interrupt;
    if (!interrupt) return undefined;
    if (
      !interrupt.interruptId.trim()
      || !interrupt.idempotencyKey.trim()
      || (interrupt.action !== "approve" && interrupt.action !== "reject")
    ) {
      throw new RuntimePortError("RUNTIME_INPUT_INVALID", "Human Approval interrupt command 不完整。");
    }
    const resumeAction = command.resumeData.action;
    const resumeInterruptId = typeof command.resumeData.interruptId === "string"
      ? command.resumeData.interruptId
      : command.resumeData.approvalRequestId;
    if (resumeAction !== interrupt.action || resumeInterruptId !== interrupt.interruptId) {
      throw new RuntimePortError("RUNTIME_OWNERSHIP_CONFLICT", "Human Approval resume data 与 interrupt command 不一致。");
    }
    return {
      interruptId: interrupt.interruptId,
      idempotencyKey: interrupt.idempotencyKey,
      decisionHash: createHash("sha256").update(stableSerialize({
        interruptId: interrupt.interruptId,
        action: interrupt.action,
        data: command.resumeData.data ?? {},
      })).digest("hex"),
    };
  }

  private matchesReceipt(
    record: StoredMastraWorkflowRun,
    decision: { interruptId: string; idempotencyKey: string; decisionHash: string },
  ): boolean {
    const receipt = record.interruptDecision;
    return Boolean(receipt)
      && receipt!.interruptId === decision.interruptId
      && receipt!.idempotencyKey === decision.idempotencyKey
      && receipt!.decisionHash === decision.decisionHash;
  }

  private async assertInterruptResume(
    record: StoredMastraWorkflowRun,
    command: ResumeWorkflowRunCommand,
    resumeStep: string | string[] | undefined,
    productStepId: string | undefined,
    allowAutomaticTimeout = false,
  ): Promise<Record<string, unknown>> {
    const node = productStepId
      ? record.ir.nodes.find((candidate) => candidate.id === productStepId)
      : undefined;
    if (node?.kind !== "human-approval") {
      if (command.interrupt) {
        throw new RuntimePortError("RUNTIME_OWNERSHIP_CONFLICT", "非 Human Approval 节点不得携带 interrupt 决定。");
      }
      return command.resumeData;
    }
    const automaticTimeout = allowAutomaticTimeout && command.resumeData.action === "timeout";
    const timeoutInterruptId = typeof command.resumeData.interruptId === "string"
      ? command.resumeData.interruptId
      : command.resumeData.approvalRequestId;
    const decision = automaticTimeout && typeof timeoutInterruptId === "string"
      ? { interruptId: timeoutInterruptId, idempotencyKey: "", decisionHash: "" }
      : this.interruptDecision(command);
    if (!decision) throw new RuntimePortError("RUNTIME_OWNERSHIP_CONFLICT", "Human Approval 必须携带 run-scoped interrupt 决定。");
    const mapping = await this.runMappings.get("workflow", command.runId);
    if (!mapping || mapping.mastraRunId !== record.nativeRunId) {
      throw new RuntimePortError(
        "RUNTIME_OWNERSHIP_CONFLICT",
        "Human Approval 无法通过 product/native run mapping 定位同一 Mastra snapshot。",
        { runId: command.runId, interruptId: decision.interruptId },
      );
    }
    const compiled = this.compiler.compile(record.ir, { targetNodeId: record.targetNodeId });
    const state = await compiled.workflow.getWorkflowRunById(record.nativeRunId, { withNestedWorkflows: true });
    const expectedPath = Array.isArray(resumeStep) ? resumeStep : resumeStep ? [resumeStep] : [node.id];
    const suspended = state
      ? getWorkflowSuspendedSteps(state).find((item) => (
        stableSerialize(item.path) === stableSerialize(expectedPath)
        || item.path.at(-1) === node.id
      ))
      : undefined;
    const payload = approvalSuspendPayload(suspended?.suspendPayload) ?? {};
    const payloadInterruptId = typeof payload.interruptId === "string"
      ? payload.interruptId
      : payload.approvalRequestId;
    if (
      payload.kind !== "approval"
      || payloadInterruptId !== decision.interruptId
    ) {
      throw new RuntimePortError(
        "RUNTIME_OWNERSHIP_CONFLICT",
        "Human Approval interrupt identity 与 Mastra suspended snapshot 不一致。",
        { runId: command.runId, nodeId: node.id, interruptId: decision.interruptId },
      );
    }
    if (!automaticTimeout) {
      const data = command.resumeData.data ?? {};
      const diagnostics = validateWorkflowJsonSchema(
        data,
        payload.decisionSchema as Parameters<typeof validateWorkflowJsonSchema>[1],
        node.id,
        ["decision"],
      );
      if (diagnostics.length > 0) {
        throw new RuntimePortError(
          "RUNTIME_INPUT_INVALID",
          "Human Approval decision data 不符合 decisionSchema。",
          { diagnostics },
        );
      }
    }
    if (typeof payload.deadline === "number" && payload.deadline <= Date.now()) {
      return {
        interruptId: decision.interruptId,
        approvalRequestId: decision.interruptId,
        action: "timeout",
        data: {},
        timedOut: true,
      };
    }
    if (automaticTimeout) {
      throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", "Human Approval 尚未达到 timeout deadline。");
    }
    return command.resumeData;
  }

  private async expireWaitingRun(
    record: StoredMastraWorkflowRun,
    snapshot: WorkflowRunSnapshot,
  ): Promise<WorkflowRunSnapshot> {
    const setup = await this.withRunControl(snapshot.id, async () => {
      const active = this.active.get(snapshot.id);
      if (active) return { completion: active.completion };
      const latestRecord = await this.requireRecord(snapshot.id);
      const latestSnapshot = await this.enrichWaitingSnapshot(latestRecord, latestRecord.snapshot);
      const waiting = latestSnapshot.waiting?.waiting;
      if (
        latestSnapshot.status !== "waiting"
        || waiting?.kind !== "approval"
        || waiting.deadline > Date.now()
      ) {
        return { completion: Promise.resolve(await this.projectSnapshot(latestSnapshot)) };
      }
      const productStepId = latestSnapshot.waiting?.nodeId;
      const resumeStep = await this.nativeResumeStep(latestRecord, productStepId);
      const timeoutCommand: ResumeWorkflowRunCommand = {
        runId: snapshot.id,
        stepId: productStepId,
        resumeData: {
          interruptId: waiting.interruptId,
          approvalRequestId: waiting.interruptId,
          action: "timeout",
          data: {},
          timedOut: true,
        },
      };
      const resumeData = await this.assertInterruptResume(
        latestRecord,
        timeoutCommand,
        resumeStep,
        productStepId,
        true,
      );
      const native = await this.restoreNativeRun(latestRecord);
      const runningRecord: StoredMastraWorkflowRun = {
        ...latestRecord,
        snapshot: { ...latestSnapshot, status: "running", finishedAt: undefined },
      };
      await this.runs.update(runningRecord);
      await this.journal.appendWorkflow(snapshot.id, { type: "run.status", status: "running" });
      const completion = this.executeResume(
        runningRecord,
        native,
        { ...timeoutCommand, resumeData },
        resumeStep,
      );
      this.active.set(snapshot.id, { native, completion, cancelRequested: false });
      void completion.catch(() => undefined);
      return { completion };
    });
    return setup.completion;
  }

  private async cleanupExpiredTechnicalState(): Promise<void> {
    const removed = await this.runs.cleanupExpired();
    await Promise.all(removed.flatMap((runId) => [
      this.runMappings.remove("workflow", runId),
      this.journal.removeWorkflow(runId),
    ]));
  }

  private async enrichWaitingSnapshot(
    record: StoredMastraWorkflowRun,
    snapshot: WorkflowRunSnapshot,
  ): Promise<WorkflowRunSnapshot> {
    if (snapshot.status !== "waiting" || snapshot.waiting?.waiting) return snapshot;
    const compiled = this.compiler.compile(record.ir, { targetNodeId: record.targetNodeId });
    const state = await compiled.workflow.getWorkflowRunById(record.nativeRunId, { withNestedWorkflows: true });
    const suspended = state ? getWorkflowSuspendedSteps(state)[0] : undefined;
    const waiting = waitingMetadataFromPayload(suspended?.suspendPayload);
    if (!waiting) return snapshot;
    const nodeId = snapshot.waiting?.nodeId
      ?? Object.values(snapshot.nodeRuns).find((node) => node.status === "waiting")?.nodeId
      ?? suspended?.path.at(-1);
    if (!nodeId) return snapshot;
    return {
      ...snapshot,
      waiting: {
        nodeId,
        reason: "Human approval pending",
        waiting,
      },
    };
  }

  private async withRunControl<T>(runId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.controlQueues.get(runId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.catch(() => undefined).then(() => gate);
    this.controlQueues.set(runId, queued);
    await previous.catch(() => undefined);
    try {
      return await action();
    } finally {
      release();
      if (this.controlQueues.get(runId) === queued) this.controlQueues.delete(runId);
    }
  }

  private async *observe(runId: string, sinceId: number): AsyncIterable<WorkflowRuntimeEvent> {
    await this.requireRecord(runId);
    const queue = new AsyncEventQueue<WorkflowRuntimeEvent>();
    const unsubscribe = this.journal.subscribeWorkflow(runId, (event) => queue.push(event));
    let lastId = sinceId;
    try {
      for (const event of await this.journal.listWorkflow(runId, sinceId)) {
        lastId = Math.max(lastId, event.id);
        yield event;
        if (event.type === "run.status" && isTerminalWorkflowRunStatus(event.status)) return;
      }
      for await (const event of queue) {
        if (event.id <= lastId) continue;
        lastId = event.id;
        yield event;
        if (event.type === "run.status" && isTerminalWorkflowRunStatus(event.status)) return;
      }
    } finally {
      unsubscribe();
    }
  }

  private async *observeAfterMaintenance(runId: string, sinceId: number): AsyncIterable<WorkflowRuntimeEvent> {
    await this.get(runId);
    yield* this.observe(runId, sinceId);
  }
}
