import { randomUUID } from "node:crypto";
import {
  RuntimePortError,
  type AgentRunResult,
  type AgentRunSnapshot,
  type AgentRuntimeCapabilities,
  type AgentRuntimeEvent,
  type AgentRuntimePort,
  type AgentToolExecutionSummary,
  type AgentUsage,
  type CancelAgentRunCommand,
  type GenerateAgentCommand,
  type StreamAgentCommand,
  type RuntimeBinding,
} from "@orbit/runtime-contracts";
import { AsyncEventQueue } from "../../runtime/async-event-queue.js";
import {
  type MastraAgentExecutionResolver,
  type MastraAgentExecutor,
  type MastraAgentGenerateOutput,
  type MastraAgentResolution,
  type MastraAgentStreamOutput,
} from "../agents/execution-resolver.js";
import { MastraAgentRunRepository } from "../storage/agent-run-repository.js";
import { OrbitRuntimeEventJournal } from "../storage/event-journal.js";
import { MastraRunMappingRepository } from "../storage/run-mapping-repository.js";
import { MastraThreadMappingRepository } from "../storage/thread-mapping-repository.js";
import { collectMastraBoundarySecrets, redactMastraBoundaryValue } from "./redaction.js";
import { ORBIT_PRODUCT_RUN_ID_KEY } from "../tools/tool-execution-adapter.js";
import { MastraAgentEventMapper } from "./agent-event-mapper.js";

export type {
  MastraAgentExecutionResolver,
  MastraAgentExecutor,
} from "../agents/execution-resolver.js";

export const MASTRA_AGENT_ADAPTER_VERSION = "mastra-agent-v1";

type AdapterOptions = {
  resolver: MastraAgentExecutionResolver;
  root?: string;
  persistenceEnabled?: boolean;
  nativeRunId?: () => string;
  runMappings?: MastraRunMappingRepository;
  threadMappings?: MastraThreadMappingRepository;
  journal?: OrbitRuntimeEventJournal;
  runs?: MastraAgentRunRepository;
};

type ActiveRun = {
  executor: MastraAgentExecutor;
  nativeRunId: string;
  abortController: AbortController;
  cancelRequested: boolean;
  completion: Promise<AgentRunResult>;
};

type ToolPayload = {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  error?: unknown;
  isError?: boolean;
  argsTextDelta?: string;
  text?: string;
};

function normalizeUsage(usage: AgentUsage | undefined): AgentUsage | undefined {
  if (!usage) return undefined;
  const normalized = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    reasoningTokens: usage.reasoningTokens,
    cachedInputTokens: usage.cachedInputTokens,
  };
  return Object.values(normalized).some((value) => value !== undefined) ? normalized : undefined;
}

function isTerminal(status: AgentRunSnapshot["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function toolPayload(value: unknown): ToolPayload {
  return value && typeof value === "object" ? value as ToolPayload : {};
}

function toolChunkPayload(value: unknown): ToolPayload {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return toolPayload(record.payload ?? value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 将 Mastra Agent generate/stream 翻译为稳定 AgentRuntimePort。 */
export class MastraAgentRuntimeAdapter implements AgentRuntimePort {
  private readonly resolver: MastraAgentExecutionResolver;
  private readonly nativeRunId: () => string;
  private readonly runMappings: MastraRunMappingRepository;
  private readonly threadMappings: MastraThreadMappingRepository;
  private readonly journal: OrbitRuntimeEventJournal;
  private readonly runs: MastraAgentRunRepository;
  private readonly active = new Map<string, ActiveRun>();

  constructor(options: AdapterOptions) {
    this.resolver = options.resolver;
    this.nativeRunId = options.nativeRunId ?? randomUUID;
    const repositoryOptions = { root: options.root, persistenceEnabled: options.persistenceEnabled };
    this.runMappings = options.runMappings ?? new MastraRunMappingRepository(repositoryOptions);
    this.threadMappings = options.threadMappings ?? new MastraThreadMappingRepository(repositoryOptions);
    this.journal = options.journal ?? new OrbitRuntimeEventJournal(repositoryOptions);
    this.runs = options.runs ?? new MastraAgentRunRepository(repositoryOptions);
  }

  capabilities(): Promise<AgentRuntimeCapabilities> {
    return Promise.resolve({
      generate: true,
      stream: true,
      eventReplay: true,
      runQuery: true,
      cancel: true,
      toolEvents: true,
      usage: true,
      sessionMemory: this.resolver.sessionMemory,
    });
  }

  async generate(command: GenerateAgentCommand): Promise<AgentRunResult> {
    const runId = command.runId ?? randomUUID();
    const existing = await this.runs.get(runId);
    if (existing) {
      if (isTerminal(existing.status)) return existing as AgentRunResult;
      throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", `Agent run ${runId} 已在运行。`);
    }
    const prepared = await this.prepare(runId, command);
    const completion = this.executeGenerate(runId, command, prepared);
    this.active.set(runId, { ...prepared, cancelRequested: false, completion });
    return await completion;
  }

  stream(command: StreamAgentCommand): AsyncIterable<AgentRuntimeEvent> {
    if ((command.sinceId ?? 0) > 0 && !command.runId) {
      throw new RuntimePortError("RUNTIME_NOT_FOUND", "Agent 事件重放必须提供 runId。");
    }
    const runId = command.runId ?? randomUUID();
    void this.startStreamIfNeeded(runId, command);
    return this.observe(runId, command.sinceId ?? 0);
  }

  getRun(runId: string): Promise<AgentRunSnapshot | null> {
    return this.runs.get(runId);
  }

  async cancel(command: CancelAgentRunCommand): Promise<AgentRunSnapshot> {
    const snapshot = await this.runs.get(command.runId);
    if (!snapshot) throw new RuntimePortError("RUNTIME_NOT_FOUND", `Agent run ${command.runId} 不存在。`);
    if (isTerminal(snapshot.status)) {
      throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", `Agent run ${command.runId} 已处于终态。`);
    }
    const active = this.active.get(command.runId);
    if (!active) {
      throw new RuntimePortError("RUNTIME_NOT_FOUND", `Agent run ${command.runId} 当前进程中不可取消。`);
    }
    active.cancelRequested = true;
    active.abortController.abort(command.reason ?? "cancelled");
    active.executor.abortRunStream(active.nativeRunId);
    return await active.completion;
  }

  private async prepare(
    runId: string,
    command: GenerateAgentCommand | StreamAgentCommand,
  ): Promise<{
    executor: MastraAgentExecutor;
    nativeRunId: string;
    abortController: AbortController;
    resolution: MastraAgentResolution;
    startedAt: number;
    secrets: string[];
    binding: RuntimeBinding;
  }> {
    const nativeRunId = this.nativeRunId();
    const ownerId = typeof command.requestContext.ownerId === "string"
      ? command.requestContext.ownerId
      : command.resourceId;
    const identity = await this.threadMappings.bind({
      ownerId,
      resourceId: command.resourceId,
      threadId: command.threadId,
      mastraResourceId: command.resourceId,
      mastraThreadId: command.threadId,
    });
    const resolution = await this.resolver.resolve(command, identity);
    resolution.executionOptions.requestContext.set(ORBIT_PRODUCT_RUN_ID_KEY, runId);
    await this.runMappings.bind({
      domain: "agent",
      productRunId: runId,
      mastraRunId: nativeRunId,
      adapterVersion: MASTRA_AGENT_ADAPTER_VERSION,
    });
    const startedAt = Date.now();
    const binding: RuntimeBinding = {
      ...command.runtimeBinding,
      backend: "mastra",
      adapterVersion: command.runtimeBinding?.adapterVersion ?? MASTRA_AGENT_ADAPTER_VERSION,
      nativeRunId,
    };
    const snapshot: AgentRunSnapshot = {
      id: runId,
      status: "running",
      createdAt: startedAt,
      startedAt,
      sessionId: command.sessionId,
      resourceId: command.resourceId,
      threadId: command.threadId,
      binding,
    };
    await this.runs.create(snapshot);
    await this.journal.appendAgent(runId, { type: "run.status", status: "running" });
    return {
      executor: resolution.executor,
      nativeRunId,
      abortController: new AbortController(),
      resolution,
      startedAt,
      secrets: collectMastraBoundarySecrets(command.requestContext),
      binding,
    };
  }

  private async executeGenerate(
    runId: string,
    command: GenerateAgentCommand,
    prepared: Awaited<ReturnType<MastraAgentRuntimeAdapter["prepare"]>>,
  ): Promise<AgentRunResult> {
    try {
      const output = await prepared.executor.generate(command.messages, {
        ...prepared.resolution.executionOptions,
        runId: prepared.nativeRunId,
        abortSignal: prepared.abortController.signal,
      });
      const result = await this.resultFromGenerate(runId, command, prepared, output);
      return await this.finish(runId, result, prepared.resolution, prepared.startedAt);
    } catch (error) {
      const result = this.failureResult(runId, command, prepared, error);
      return await this.finish(runId, result, prepared.resolution, prepared.startedAt);
    } finally {
      this.active.delete(runId);
    }
  }

  private async startStreamIfNeeded(runId: string, command: StreamAgentCommand): Promise<void> {
    const existing = await this.runs.get(runId);
    if (existing) return;
    try {
      const prepared = await this.prepare(runId, command);
      const completion = this.executeStream(runId, command, prepared);
      this.active.set(runId, { ...prepared, cancelRequested: false, completion });
      await completion;
    } catch (error) {
      const current = await this.runs.get(runId);
      if (current) return;
      const now = Date.now();
      const failed: AgentRunResult = {
        id: runId,
        status: "failed",
        createdAt: now,
        startedAt: now,
        finishedAt: now,
        sessionId: command.sessionId,
        resourceId: command.resourceId,
        threadId: command.threadId,
        binding: {
          ...command.runtimeBinding,
          backend: "mastra",
          adapterVersion: command.runtimeBinding?.adapterVersion ?? MASTRA_AGENT_ADAPTER_VERSION,
        },
        text: "",
        toolExecutions: [],
        error: { code: "MASTRA_AGENT_PREPARE_FAILED", message: errorMessage(error) },
      };
      await this.runs.create(failed);
      await this.journal.appendAgent(runId, { type: "run.final", result: failed });
    }
  }

  private async executeStream(
    runId: string,
    command: StreamAgentCommand,
    prepared: Awaited<ReturnType<MastraAgentRuntimeAdapter["prepare"]>>,
  ): Promise<AgentRunResult> {
    const eventMapper = new MastraAgentEventMapper({ secrets: prepared.secrets });
    let streamOutput: MastraAgentStreamOutput | null = null;
    let streamError: unknown = null;
    try {
      streamOutput = await prepared.executor.stream(command.messages, {
        ...prepared.resolution.executionOptions,
        runId: prepared.nativeRunId,
        abortSignal: prepared.abortController.signal,
      });
      if (streamOutput.runId !== prepared.nativeRunId) {
        throw new Error(`Mastra runId 不一致：expected ${prepared.nativeRunId}, received ${streamOutput.runId}`);
      }
      for await (const chunk of streamOutput.fullStream) {
        for (const event of eventMapper.map(chunk)) await this.journal.appendAgent(runId, event);
      }
      const [text, finishReason, usage] = await Promise.all([
        streamOutput.text,
        streamOutput.finishReason,
        streamOutput.totalUsage,
      ]);
      const active = this.active.get(runId);
      const result = this.result(runId, command, prepared, {
        text,
        finishReason,
        usage,
        toolExecutions: eventMapper.toolExecutions(),
        error: streamOutput.error,
        tripwire: streamOutput.tripwire,
        cancelled: active?.cancelRequested === true,
      });
      return await this.finish(runId, result, prepared.resolution, prepared.startedAt);
    } catch (error) {
      streamError = error;
      const result = this.failureResult(runId, command, prepared, error, eventMapper.toolExecutions());
      return await this.finish(runId, result, prepared.resolution, prepared.startedAt);
    } finally {
      this.active.delete(runId);
      void streamError;
    }
  }

  private async resultFromGenerate(
    runId: string,
    command: GenerateAgentCommand,
    prepared: Awaited<ReturnType<MastraAgentRuntimeAdapter["prepare"]>>,
    output: MastraAgentGenerateOutput,
  ): Promise<AgentRunResult> {
    if (output.runId && output.runId !== prepared.nativeRunId) {
      throw new Error(`Mastra runId 不一致：expected ${prepared.nativeRunId}, received ${output.runId}`);
    }
    const toolResults = new Map<string, AgentToolExecutionSummary>();
    for (const item of output.toolResults) {
      const payload = toolChunkPayload(item);
      const callId = payload.toolCallId ?? "unknown-call";
      toolResults.set(callId, {
        callId,
        toolId: payload.toolName ?? "unknown-tool",
        status: payload.isError ? "failed" : "succeeded",
        output: payload.isError ? undefined : redactMastraBoundaryValue(payload.result, prepared.secrets),
        error: payload.isError ? {
          code: "MASTRA_TOOL_EXECUTION_FAILED",
          message: String(redactMastraBoundaryValue(errorMessage(payload.result), prepared.secrets)),
        } : undefined,
      });
    }
    for (const item of output.toolCalls) {
      const payload = toolChunkPayload(item);
      const callId = payload.toolCallId ?? "unknown-call";
      if (!toolResults.has(callId)) {
        toolResults.set(callId, {
          callId,
          toolId: payload.toolName ?? "unknown-tool",
          status: "failed",
          error: { code: "MASTRA_TOOL_RESULT_MISSING", message: "Tool 调用未返回结果。" },
        });
      }
    }
    return this.result(runId, command, prepared, {
      text: String(redactMastraBoundaryValue(output.text, prepared.secrets)),
      finishReason: output.finishReason,
      usage: output.totalUsage,
      toolExecutions: [...toolResults.values()],
      error: output.error,
      tripwire: output.tripwire,
      cancelled: this.active.get(runId)?.cancelRequested === true,
    });
  }

  private result(
    runId: string,
    command: GenerateAgentCommand | StreamAgentCommand,
    prepared: Awaited<ReturnType<MastraAgentRuntimeAdapter["prepare"]>>,
    output: {
      text: string;
      finishReason?: string;
      usage?: AgentUsage;
      toolExecutions: AgentToolExecutionSummary[];
      error?: Error;
      tripwire?: { reason: string; metadata?: unknown };
      cancelled: boolean;
    },
  ): AgentRunResult {
    const cancelled = output.cancelled;
    const failed = !cancelled && Boolean(output.error || output.tripwire || output.finishReason === "tripwire");
    return {
      id: runId,
      status: cancelled ? "cancelled" : failed ? "failed" : "succeeded",
      createdAt: prepared.startedAt,
      startedAt: prepared.startedAt,
      finishedAt: Date.now(),
      sessionId: command.sessionId,
      resourceId: command.resourceId,
      threadId: command.threadId,
      binding: prepared.binding,
      usage: normalizeUsage(output.usage),
      text: String(redactMastraBoundaryValue(output.text, prepared.secrets)),
      toolExecutions: output.toolExecutions,
      error: cancelled ? {
        code: "RUNTIME_CANCELLED",
        message: "Agent run 已取消。",
      } : failed ? {
        code: output.tripwire || output.finishReason === "tripwire"
          ? "MASTRA_AGENT_TRIPWIRE"
          : "MASTRA_AGENT_EXECUTION_FAILED",
        message: String(redactMastraBoundaryValue(
          output.tripwire?.reason ?? output.error?.message ?? "Mastra Agent 执行失败。",
          prepared.secrets,
        )),
        details: output.tripwire?.metadata && typeof output.tripwire.metadata === "object"
          ? redactMastraBoundaryValue(output.tripwire.metadata, prepared.secrets) as Record<string, unknown>
          : undefined,
      } : undefined,
    };
  }

  private failureResult(
    runId: string,
    command: GenerateAgentCommand | StreamAgentCommand,
    prepared: Awaited<ReturnType<MastraAgentRuntimeAdapter["prepare"]>>,
    error: unknown,
    toolExecutions: AgentToolExecutionSummary[] = [],
  ): AgentRunResult {
    const cancelled = this.active.get(runId)?.cancelRequested === true || prepared.abortController.signal.aborted;
    return this.result(runId, command, prepared, {
      text: "",
      toolExecutions,
      error: cancelled ? undefined : new Error(errorMessage(error)),
      cancelled,
    });
  }

  private async finish(
    runId: string,
    result: AgentRunResult,
    resolution: MastraAgentResolution,
    startedAt: number,
  ): Promise<AgentRunResult> {
    const stored = await this.runs.finish(result);
    if (stored.usage) {
      await resolution.finalizeUsage(stored.usage, Date.now() - startedAt);
      await this.journal.appendAgent(runId, { type: "usage", usage: stored.usage });
    }
    await this.journal.appendAgent(runId, { type: "run.status", status: stored.status });
    await this.journal.appendAgent(runId, { type: "run.final", result: stored });
    return stored;
  }

  private async *observe(runId: string, sinceId: number): AsyncIterable<AgentRuntimeEvent> {
    const queue = new AsyncEventQueue<AgentRuntimeEvent>();
    const unsubscribe = this.journal.subscribeAgent(runId, (event) => queue.push(event));
    let lastId = sinceId;
    try {
      const historical = await this.journal.listAgent(runId, sinceId);
      for (const event of historical) {
        lastId = Math.max(lastId, event.id);
        yield event;
        if (event.type === "run.final") return;
      }
      for await (const event of queue) {
        if (event.id <= lastId) continue;
        lastId = event.id;
        yield event;
        if (event.type === "run.final") return;
      }
    } finally {
      unsubscribe();
    }
  }
}
