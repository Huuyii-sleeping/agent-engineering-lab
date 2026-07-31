import type OpenAI from "openai";
import {
  RuntimePortError,
  type AgentRunResult,
  type AgentRuntimePort,
  type GenerateAgentCommand,
  type MemoryRuntimePort,
  type RuntimeGateway,
  type ToolExecutionPort,
  type WorkflowRuntimePort,
} from "@orbit/runtime-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentAppRuntime } from "../../src/bootstrap/app-runtime.js";
import { AgentHost } from "../../src/host/agent-host.js";
import { AgentService } from "../../src/service-api/index.js";

const previousPersistence = process.env.AGENT_PRIVACY_PERSISTENCE_MODE;

function resultFor(command: GenerateAgentCommand, text = "Mastra reply"): AgentRunResult {
  return {
    id: command.runId ?? "agent-run-1",
    status: "succeeded",
    createdAt: 1,
    finishedAt: 2,
    sessionId: command.sessionId,
    resourceId: command.resourceId,
    threadId: command.threadId,
    binding: { backend: "mastra", adapterVersion: "mastra-agent-v1" },
    text,
    toolExecutions: [],
  };
}

function createHarness(overrides: {
  generate?: AgentRuntimePort["generate"];
  stream?: AgentRuntimePort["stream"];
  executeTool?: ToolExecutionPort["execute"];
} = {}) {
  const generate = vi.fn(overrides.generate ?? (async (command) => resultFor(command)));
  const stream = vi.fn(overrides.stream ?? (async function* (command) {
    const result = resultFor(command, "stream reply");
    yield { id: 1, runId: result.id, at: 1, type: "text.delta" as const, delta: "stream " };
    yield { id: 2, runId: result.id, at: 2, type: "text.delta" as const, delta: "reply" };
    yield { id: 3, runId: result.id, at: 3, type: "run.final" as const, result };
  }));
  const agent: AgentRuntimePort = {
    capabilities: vi.fn(async () => ({
      generate: true,
      stream: true,
      eventReplay: true,
      runQuery: true,
      cancel: true,
      toolEvents: true,
      usage: true,
      sessionMemory: true,
    })),
    generate,
    stream,
    getRun: vi.fn(async () => null),
    cancel: vi.fn(async ({ runId }) => ({
      id: runId,
      status: "cancelled",
      createdAt: 1,
      finishedAt: 2,
      sessionId: "session-1",
      resourceId: "resource-1",
      threadId: "session-1",
      binding: { backend: "mastra", adapterVersion: "mastra-agent-v1" },
    })),
  };
  const workflow: WorkflowRuntimePort = {
    capabilities: vi.fn(async () => ({
      start: true,
      query: true,
      cancel: true,
      events: true,
      eventReplay: true,
      resume: true,
      snapshots: true,
      restartRecovery: true,
    })),
    start: vi.fn(),
    get: vi.fn(async () => null),
    cancel: vi.fn(),
    events: vi.fn(async function* () {}),
    resume: vi.fn(),
  };
  const tools: ToolExecutionPort = {
    list: vi.fn(async () => []),
    execute: vi.fn(overrides.executeTool ?? (async (command) => ({
      toolId: command.toolId,
      output: command.input,
      startedAt: 1,
      finishedAt: 2,
    }))),
  };
  const createThread = vi.fn<MemoryRuntimePort["createThread"]>(async (command) => ({
    id: command.id ?? "thread-1",
    ownerId: command.ownerId,
    resourceId: command.resourceId,
    title: command.title,
    metadata: command.metadata ?? {},
    createdAt: 1,
    updatedAt: 1,
  }));
  const memory: MemoryRuntimePort = {
    createThread,
    getThread: vi.fn(async () => null),
    listThreads: vi.fn(async () => ({ items: [], nextCursor: null })),
    deleteThread: vi.fn(async () => undefined),
    listMessages: vi.fn(async () => ({ items: [], nextCursor: null })),
    appendMessages: vi.fn(async () => undefined),
  };
  const runtimeGateway: RuntimeGateway = { agent, workflow, tools, memory };
  const toolService = {
    listTools: vi.fn(async () => []),
    listToolRegistrations: vi.fn(async () => [{ name: "echo" } as never]),
    listToolMetadata: vi.fn(async () => [{ name: "echo", target: "base" }]),
    previewToolCall: vi.fn(() => "echo"),
    runToolByName: vi.fn(async () => "unused"),
  };
  const deps = createAgentAppRuntime({
    client: {} as OpenAI,
    model: "test-model",
    promptSource: { core: "test", tools: [], skills: [], rules: [] },
    toolService,
  });
  const host = new AgentHost(deps);
  const service = new AgentService(deps, host, { runtimeGateway });
  return { service, host, runtimeGateway, generate, stream, createThread, tools };
}

beforeEach(() => {
  process.env.AGENT_PRIVACY_PERSISTENCE_MODE = "disabled";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (previousPersistence === undefined) delete process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
  else process.env.AGENT_PRIVACY_PERSISTENCE_MODE = previousPersistence;
});

describe("agent service", () => {
  it("requires an explicit RuntimeGateway and creates Mastra-bound sessions", () => {
    const { service, runtimeGateway } = createHarness();
    const session = service.createSession({ id: "agent-1", name: "Agent 1", skills: [] });

    expect(service.runtimeGateway).toBe(runtimeGateway);
    expect(service.workflowRuntime).toBe(runtimeGateway.workflow);
    expect(session.runtimeBinding).toMatchObject({
      backend: "mastra",
      adapterVersion: "mastra-agent-v1",
      runtimeVersion: "1.52.1",
    });
  });

  it("delegates generate to AgentRuntimePort with one owner/resource/thread identity", async () => {
    const { service, generate, createThread } = createHarness();
    const session = service.createSession();

    await expect(service.chat({ session_id: session.id, message: "hello" })).resolves.toMatchObject({
      ok: true,
      assistant: "Mastra reply",
      session: { id: session.id, rounds: 1, messageCount: 2 },
    });

    expect(createThread).toHaveBeenCalledWith({
      id: session.id,
      ownerId: "local-owner",
      resourceId: `session:${session.id}`,
      metadata: { source: "agent-session" },
    });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: session.id,
      resourceId: `session:${session.id}`,
      threadId: session.id,
      runtimeBinding: expect.objectContaining({ backend: "mastra" }),
      requestContext: expect.objectContaining({
        ownerId: "local-owner",
        resourceId: `session:${session.id}`,
        threadId: session.id,
      }),
      policy: { allowedToolIds: ["echo"], allowedSkillIds: [] },
    }));
  });

  it("delegates stream to AgentRuntimePort and forwards deltas", async () => {
    const { service, stream } = createHarness();
    const session = service.createSession();
    const deltas: string[] = [];

    const response = await service.chat(
      { session_id: session.id, message: "stream" },
      { onAssistantDelta: (delta) => deltas.push(delta) },
    );

    expect(stream).toHaveBeenCalledTimes(1);
    expect(deltas).toEqual(["stream ", "reply"]);
    expect(response).toMatchObject({ ok: true, assistant: "stream reply" });
  });

  it("keeps session busy until the Mastra run finishes", async () => {
    let release!: (result: AgentRunResult) => void;
    const pending = new Promise<AgentRunResult>((resolve) => { release = resolve; });
    const { service } = createHarness({ generate: async () => pending });
    const session = service.createSession();
    const first = service.chat({ session_id: session.id, message: "first" });
    await vi.waitFor(() => expect(service.getSession(session.id)?.busy).toBe(true));

    await expect(service.chat({ session_id: session.id, message: "second" })).resolves.toMatchObject({
      ok: false,
      error: { code: "SESSION_BUSY" },
    });

    const command = {
      sessionId: session.id,
      resourceId: `session:${session.id}`,
      threadId: session.id,
    } as GenerateAgentCommand;
    release(resultFor(command));
    await first;
    expect(service.getSession(session.id)?.busy).toBe(false);
  });

  it("records transcript and host lifecycle events around Agent execution", async () => {
    const { service } = createHarness();
    const session = service.createSession();

    await service.chat({ session_id: session.id, message: "event test" });

    expect(service.getSessionDetail(session.id)).toMatchObject({
      id: session.id,
      rounds: 1,
      messages: [
        { role: "user", content: "event test" },
        { role: "assistant", content: "Mastra reply" },
      ],
    });
    expect(service.replayEventsSince(null).map((event) => event.type)).toEqual([
      "session.created",
      "chat.started",
      "chat.completed",
    ]);
  });

  it("routes direct Tool calls through ToolExecutionPort and preserves rawOutput errors", async () => {
    const { service, tools } = createHarness({
      executeTool: async () => {
        throw new RuntimePortError("TOOL_EXECUTION_FAILED", "tool failed", { rawOutput: "legacy-compatible text" });
      },
    });

    await expect(service.runToolByName("echo", "{\"text\":\"hello\"}")).resolves.toBe("legacy-compatible text");
    expect(tools.execute).toHaveBeenCalledWith(expect.objectContaining({
      toolId: "echo",
      input: { text: "hello" },
      ownerId: "local-direct-api",
      executor: { kind: "direct" },
    }));
  });

  it("reports Mastra-only runtime capabilities without migration backends", async () => {
    const { service } = createHarness();

    await expect(service.runtimeInfo()).resolves.toMatchObject({
      mode: "mastra-only",
      backends: {
        agent: { backend: "mastra", capabilities: { generate: true, stream: true } },
        workflow: { backend: "mastra", capabilities: { start: true, resume: true } },
      },
    });
  });
});
