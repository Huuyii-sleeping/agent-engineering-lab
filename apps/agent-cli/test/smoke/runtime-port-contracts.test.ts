import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  RuntimePortError,
  createRuntimeGateway,
  type AgentRunResult,
  type AgentRunSnapshot,
  type AgentRuntimeCapabilities,
  type AgentRuntimeEvent,
  type AgentRuntimePort,
  type CancelAgentRunCommand,
  type CancelWorkflowRunCommand,
  type CreateMemoryThreadCommand,
  type DeleteMemoryThreadCommand,
  type ExecuteToolCommand,
  type GenerateAgentCommand,
  type GetMemoryThreadQuery,
  type ListMemoryMessagesQuery,
  type ListMemoryThreadsQuery,
  type MemoryMessage,
  type MemoryMessagePage,
  type MemoryRuntimePort,
  type MemoryThread,
  type MemoryThreadPage,
  type ResumeWorkflowRunCommand,
  type StartWorkflowRunCommand,
  type StreamAgentCommand,
  type ToolDescriptor,
  type ToolExecutionPort,
  type ToolExecutionResult,
  type WorkflowRuntimeCapabilities,
  type WorkflowRuntimeEventQuery,
  type WorkflowRuntimePort,
} from "@orbit/runtime-contracts";
import {
  WORKFLOW_SCHEMA_VERSION,
  type WorkflowDraft,
  type WorkflowRunSnapshot,
  type WorkflowRuntimeEvent,
} from "@orbit/workflow-core";
import {
  defineAgentRuntimePortContract,
  defineMemoryRuntimePortContract,
  defineToolExecutionPortContract,
  defineWorkflowRuntimePortContract,
} from "../harness/runtime-ports/index.js";

const agentCommand = {
  agentId: "agent-contract",
  agentVersion: "1",
  sessionId: "session-contract",
  resourceId: "resource-contract",
  threadId: "thread-contract",
  messages: [{ role: "user" as const, content: "hello" }],
  requestContext: {},
  policy: { allowedToolIds: ["echo"], allowedSkillIds: [] },
};

class ReferenceAgentRuntimePort implements AgentRuntimePort {
  private readonly runs = new Map<string, AgentRunSnapshot>();

  capabilities(): Promise<AgentRuntimeCapabilities> {
    return Promise.resolve({
      generate: true,
      stream: true,
      eventReplay: true,
      runQuery: true,
      cancel: true,
      toolEvents: true,
      usage: true,
      sessionMemory: true,
    });
  }

  generate(command: GenerateAgentCommand): Promise<AgentRunResult> {
    const result = this.result(command.runId ?? randomUUID(), command);
    this.runs.set(result.id, result);
    return Promise.resolve(result);
  }

  async *stream(command: StreamAgentCommand): AsyncIterable<AgentRuntimeEvent> {
    const result = this.result(command.runId ?? randomUUID(), command);
    this.runs.set(result.id, result);
    const at = Date.now();
    yield { id: 1, runId: result.id, at, type: "run.status", status: "running" };
    yield { id: 2, runId: result.id, at, type: "text.delta", delta: "hello" };
    yield { id: 3, runId: result.id, at, type: "tool.call", callId: "call-1", toolId: "echo", input: { text: "hello" } };
    yield { id: 4, runId: result.id, at, type: "tool.result", result: result.toolExecutions[0] };
    yield { id: 5, runId: result.id, at, type: "usage", usage: result.usage! };
    yield { id: 6, runId: result.id, at, type: "run.final", result };
  }

  getRun(runId: string): Promise<AgentRunSnapshot | null> {
    return Promise.resolve(this.runs.get(runId) ?? null);
  }

  cancel(command: CancelAgentRunCommand): Promise<AgentRunSnapshot> {
    const current = this.runs.get(command.runId);
    if (!current) {
      throw new RuntimePortError("RUNTIME_NOT_FOUND", "run missing", { runId: command.runId });
    }
    const cancelled = { ...current, status: "cancelled" as const, finishedAt: Date.now() };
    this.runs.set(command.runId, cancelled);
    return Promise.resolve(cancelled);
  }

  seedRunningRun(): string {
    const id = randomUUID();
    this.runs.set(id, {
      id,
      status: "running",
      createdAt: Date.now(),
      sessionId: agentCommand.sessionId,
      resourceId: agentCommand.resourceId,
      threadId: agentCommand.threadId,
      binding: { backend: "mastra", adapterVersion: "reference" },
    });
    return id;
  }

  private result(id: string, command: GenerateAgentCommand | StreamAgentCommand): AgentRunResult {
    return {
      id,
      status: "succeeded",
      createdAt: Date.now(),
      finishedAt: Date.now(),
      sessionId: command.sessionId,
      resourceId: command.resourceId,
      threadId: command.threadId,
      binding: { backend: "mastra", adapterVersion: "reference" },
      text: "hello",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      toolExecutions: [{ callId: "call-1", toolId: "echo", status: "succeeded", output: "hello" }],
    };
  }
}

function workflowDraft(id: string): WorkflowDraft {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id,
    name: id,
    summary: "",
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    nodes: [],
    edges: [],
  };
}

class ReferenceWorkflowRuntimePort implements WorkflowRuntimePort {
  private readonly runs = new Map<string, WorkflowRunSnapshot>();
  private readonly journal = new Map<string, WorkflowRuntimeEvent[]>();

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
    });
  }

  start(command: StartWorkflowRunCommand): Promise<WorkflowRunSnapshot> {
    const id = randomUUID();
    const waiting = command.workflow.id === "waiting";
    const run = this.snapshot(id, command, waiting ? "waiting" : "succeeded");
    const at = Date.now();
    this.runs.set(id, run);
    this.journal.set(id, waiting
      ? [
          { id: 1, runId: id, at, type: "run.status", status: "queued" },
          { id: 2, runId: id, at, type: "run.waiting", nodeId: "approval", reason: "approval" },
          { id: 3, runId: id, at, type: "run.status", status: "waiting" },
        ]
      : [
          { id: 1, runId: id, at, type: "run.status", status: "queued" },
          { id: 2, runId: id, at, type: "run.status", status: "running" },
          { id: 3, runId: id, at, type: "run.status", status: "succeeded" },
        ]);
    return Promise.resolve(run);
  }

  get(runId: string): Promise<WorkflowRunSnapshot | null> {
    return Promise.resolve(this.runs.get(runId) ?? null);
  }

  async cancel(command: CancelWorkflowRunCommand): Promise<WorkflowRunSnapshot> {
    const run = this.runs.get(command.runId);
    if (!run) {
      throw new RuntimePortError("RUNTIME_NOT_FOUND", "run missing");
    }
    if (["succeeded", "failed", "cancelled"].includes(run.status)) {
      throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", "run is terminal");
    }
    const cancelled = { ...run, status: "cancelled" as const, finishedAt: Date.now() };
    this.runs.set(run.id, cancelled);
    return cancelled;
  }

  async *events(query: WorkflowRuntimeEventQuery): AsyncIterable<WorkflowRuntimeEvent> {
    for (const event of this.journal.get(query.runId) ?? []) {
      if (event.id > (query.sinceId ?? 0)) {
        yield event;
      }
    }
  }

  async resume(command: ResumeWorkflowRunCommand): Promise<WorkflowRunSnapshot> {
    const run = this.runs.get(command.runId);
    if (!run) {
      throw new RuntimePortError("RUNTIME_NOT_FOUND", "run missing");
    }
    if (run.status !== "waiting") {
      throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", "run cannot resume");
    }
    const resumed = { ...run, status: "succeeded" as const, finishedAt: Date.now() };
    this.runs.set(run.id, resumed);
    return resumed;
  }

  seedRunningRun(): string {
    const id = randomUUID();
    this.runs.set(id, this.snapshot(id, { workflow: workflowDraft("running"), mode: "draft" }, "running"));
    return id;
  }

  private snapshot(
    id: string,
    command: StartWorkflowRunCommand,
    status: WorkflowRunSnapshot["status"],
  ): WorkflowRunSnapshot {
    return {
      id,
      workflowId: "workflowId" in command.workflow ? command.workflow.workflowId : command.workflow.id,
      mode: command.mode,
      status,
      createdAt: Date.now(),
      inputs: command.inputs ?? {},
      nodeRuns: {},
    };
  }
}

class ReferenceToolExecutionPort implements ToolExecutionPort {
  readonly audit: string[] = [];
  private readonly descriptor: ToolDescriptor = {
    id: "echo",
    name: "echo",
    description: "Echo input",
    inputSchema: { type: "object", properties: { text: { type: "string" } } },
    source: "builtin",
    traits: { readOnly: true, idempotent: true, cancellable: true, sideEffecting: false },
  };

  list(): Promise<ToolDescriptor[]> {
    return Promise.resolve([this.descriptor]);
  }

  async execute(command: ExecuteToolCommand): Promise<ToolExecutionResult> {
    if (command.toolId === "denied") {
      this.audit.push("execute:denied");
      throw new RuntimePortError("TOOL_PERMISSION_DENIED", "tool denied");
    }
    if (command.toolId === "abortable") {
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(new RuntimePortError("RUNTIME_CANCELLED", "tool cancelled"));
        if (command.abortSignal?.aborted) {
          abort();
          return;
        }
        command.abortSignal?.addEventListener("abort", abort, { once: true });
      });
    }
    this.audit.push("execute:succeeded");
    const now = Date.now();
    return { toolId: command.toolId, output: command.input, startedAt: now, finishedAt: now };
  }
}

class ReferenceMemoryRuntimePort implements MemoryRuntimePort {
  private readonly threads = new Map<string, MemoryThread>();
  private readonly messages = new Map<string, MemoryMessage[]>();

  createThread(command: CreateMemoryThreadCommand): Promise<MemoryThread> {
    const id = command.id ?? randomUUID();
    const now = Date.now();
    const thread: MemoryThread = {
      id,
      ownerId: command.ownerId,
      resourceId: command.resourceId,
      title: command.title,
      metadata: command.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.threads.set(id, thread);
    this.messages.set(id, []);
    return Promise.resolve(thread);
  }

  async getThread(query: GetMemoryThreadQuery): Promise<MemoryThread | null> {
    const thread = this.threads.get(query.threadId);
    if (!thread) {
      return null;
    }
    this.assertOwnership(thread, query);
    return thread;
  }

  listThreads(query: ListMemoryThreadsQuery): Promise<MemoryThreadPage> {
    const owned = [...this.threads.values()].filter(
      (thread) => thread.ownerId === query.ownerId && thread.resourceId === query.resourceId,
    );
    const offset = Number(query.cursor ?? 0);
    const limit = query.limit ?? 20;
    const items = owned.slice(offset, offset + limit);
    return Promise.resolve({
      items,
      nextCursor: offset + limit < owned.length ? String(offset + limit) : null,
    });
  }

  async deleteThread(command: DeleteMemoryThreadCommand): Promise<void> {
    const thread = await this.getThread(command);
    if (!thread) {
      return;
    }
    this.threads.delete(thread.id);
    this.messages.delete(thread.id);
  }

  async listMessages(query: ListMemoryMessagesQuery): Promise<MemoryMessagePage> {
    const thread = await this.getThread(query);
    if (!thread) {
      throw new RuntimePortError("RUNTIME_NOT_FOUND", "thread missing");
    }
    const all = this.messages.get(thread.id) ?? [];
    const offset = Number(query.cursor ?? 0);
    const limit = query.limit ?? 20;
    return {
      items: all.slice(offset, offset + limit),
      nextCursor: offset + limit < all.length ? String(offset + limit) : null,
    };
  }

  async appendMessages(command: Parameters<MemoryRuntimePort["appendMessages"]>[0]): Promise<void> {
    const thread = await this.getThread(command);
    if (!thread) {
      throw new RuntimePortError("RUNTIME_NOT_FOUND", "thread missing");
    }
    const target = this.messages.get(thread.id) ?? [];
    target.push(...command.messages.map((message) => ({
      ...message,
      id: message.id ?? randomUUID(),
      threadId: thread.id,
      resourceId: thread.resourceId,
      createdAt: message.createdAt ?? Date.now(),
    })));
    this.messages.set(thread.id, target);
  }

  private assertOwnership(thread: MemoryThread, ownership: { ownerId: string; resourceId: string }): void {
    if (thread.ownerId !== ownership.ownerId || thread.resourceId !== ownership.resourceId) {
      throw new RuntimePortError("RUNTIME_OWNERSHIP_CONFLICT", "thread ownership conflict");
    }
  }
}

defineAgentRuntimePortContract("reference", () => {
  const port = new ReferenceAgentRuntimePort();
  return {
    port,
    generateCommand: agentCommand,
    streamCommand: agentCommand,
    seedRunningRun: async () => port.seedRunningRun(),
  };
});

defineWorkflowRuntimePortContract("reference", () => {
  const port = new ReferenceWorkflowRuntimePort();
  return {
    port,
    startCommand: { workflow: workflowDraft("success"), mode: "draft" },
    waitingCommand: { workflow: workflowDraft("waiting"), mode: "draft" },
    seedRunningRun: async () => port.seedRunningRun(),
    resumeCommand: (runId: string) => ({ runId, stepId: "approval", resumeData: { approved: true } }),
  };
});

defineToolExecutionPortContract("reference", () => {
  const port = new ReferenceToolExecutionPort();
  const base = {
    ownerId: "owner-a",
    executor: { kind: "direct" as const },
    requestContext: {},
    input: { text: "hello" },
  };
  return {
    port,
    listContext: { ownerId: "owner-a" },
    allowedCommand: { ...base, toolId: "echo" },
    deniedCommand: { ...base, toolId: "denied" },
    abortCommand: (abortSignal: AbortSignal) => ({ ...base, toolId: "abortable", abortSignal }),
    auditActions: () => port.audit,
  };
});

defineMemoryRuntimePortContract("reference", () => ({
  port: new ReferenceMemoryRuntimePort(),
  ownerA: { ownerId: "owner-a", resourceId: "resource-a" },
  ownerB: { ownerId: "owner-b", resourceId: "resource-b" },
}));

describe("RuntimeGateway contract", () => {
  it("只组合对应 Port，不引入额外路由逻辑", () => {
    const ports = {
      agent: new ReferenceAgentRuntimePort(),
      workflow: new ReferenceWorkflowRuntimePort(),
      tools: new ReferenceToolExecutionPort(),
      memory: new ReferenceMemoryRuntimePort(),
    };

    const gateway = createRuntimeGateway(ports);

    expect(gateway.agent).toBe(ports.agent);
    expect(gateway.workflow).toBe(ports.workflow);
    expect(gateway.tools).toBe(ports.tools);
    expect(gateway.memory).toBe(ports.memory);
  });
});
