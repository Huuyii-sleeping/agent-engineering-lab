import type OpenAI from "openai";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { readAuditEvents } from "../../src/audit/runtime.js";
import { AgentService, createAgentHttpServer } from "../../src/service-api/index.js";
import { AgentHost } from "../../src/host/agent-host.js";
import type { DeliveryServiceLike } from "../../src/services/delivery-service.js";
import type { HookServiceLike } from "../../src/services/hook-service.js";
import type { QueryEngineRunInput } from "../../src/agent-loop.js";
import type { MemoryServiceLike } from "../../src/services/memory-service.js";
import type { ModelPolicyServiceLike } from "../../src/services/model-policy-service.js";
import type { ObservabilityServiceLike } from "../../src/services/observability-service.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { StaticPromptSource } from "../../src/prompt/types.js";
import type { ToolServiceLike } from "../../src/tools/service.js";

const PROMPT_SOURCE: StaticPromptSource = {
  core: "test-core",
  tools: [],
  skills: [],
  rules: [],
};

let tempDir = "";
let previousCwd = "";

async function withAuditWorkspace(): Promise<void> {
  tempDir = await mkdtemp(path.join(tmpdir(), "agent-service-audit-test-"));
  previousCwd = process.cwd();
  process.chdir(tempDir);
}

function createLoopRunner(onRun?: (input: QueryEngineRunInput) => void) {
  return {
    run: async (input: QueryEngineRunInput): Promise<void> => {
      onRun?.(input);
      const { messages, runtimeState, onAssistantDelta } = input;
      const latestUser = [...messages].reverse().find((item) => item.role === "user");
      await onAssistantDelta?.("reply:");
      await onAssistantDelta?.(runtimeState.sessionId);
      await onAssistantDelta?.(":");
      await onAssistantDelta?.(typeof latestUser?.content === "string" ? latestUser.content : "");
      messages.push({
        role: "assistant",
        content: `reply:${runtimeState.sessionId}:${typeof latestUser?.content === "string" ? latestUser.content : ""}`,
      });
    },
  };
}

async function writeSkillHubPackage(
  root: string,
  sourceType: "remote" | "custom",
  id: string,
  version: string,
  body: string,
): Promise<void> {
  const packageDir = path.join(root, sourceType, id, version);
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, "SKILL.md"), body);
  await writeFile(
    path.join(packageDir, "skill.json"),
    JSON.stringify({
      id,
      name: id,
      summary: "Test skill.",
      category: "test",
      provider: "test",
      version,
      runtime: "local",
      permissions: [],
      updatedAt: "2026-07-03",
      maturity: "stable",
      tags: [],
      entry: "SKILL.md",
    }),
  );
}

function createToolService(overrides: Partial<ToolServiceLike> = {}): ToolServiceLike {
  return {
    listTools: async () => [],
    listToolRegistrations: async () => [],
    listToolMetadata: async () => [],
    previewToolCall: () => "",
    runToolByName: async () => "",
    ...overrides,
  };
}

function createDeliveryService(): DeliveryServiceLike {
  return {
    loadLatestReport: async () => null,
    runValidation: async () => {
      throw new Error("not used");
    },
    runValidateTool: async () => "",
    runReportTool: async () => "",
  };
}

function createHookService(): HookServiceLike {
  return {
    run: async () => ({
      blocked: false,
      blockReason: null,
      messages: [],
      matched: 0,
      executed: 0,
      errors: [],
    }),
  };
}

function createMemoryService(): MemoryServiceLike {
  return {
    autoExtract: async () => undefined,
    buildInjectionForQuery: async () => ({
      content: null,
      usedEntries: 0,
      estimatedTokens: 0,
    }),
    runAdd: async () => "",
    runSearch: async () => "",
    runList: async () => "",
  };
}

function createModelPolicyService(): ModelPolicyServiceLike {
  return {
    selectModel: async () => ({
      role: "coding",
      model: "fake-model",
      fallbackModel: null,
      estimatedPromptTokens: 0,
      estimatedPromptCostUsd: 0,
      budgetAction: "allow",
      budgetReason: null,
    }),
    selectFallbackModel: async () => null,
    finalizeUsage: async () => undefined,
  };
}

function createObservabilityService(): ObservabilityServiceLike {
  return {
    createTraceId: () => "trace-test",
    createSpanId: () => "span-test",
    withExecutionContext: async (_context, fn) => fn(),
    recordEvent: async () => ({
      schemaVersion: 1,
      id: "evt-test",
      at: 0,
      trace_id: "trace-test",
      span_id: null,
      kind: "test",
      payload: {},
    }),
  };
}

async function requestServer(
  server: ReturnType<typeof createAgentHttpServer>,
  method: string,
  url: string,
  body?: unknown,
): Promise<{
  statusCode: number;
  body: Record<string, unknown>;
}> {
  let sent = false;
  const req = new Readable({
    read() {
      if (sent) {
        return;
      }
      sent = true;
      if (body !== undefined) {
        this.push(JSON.stringify(body));
      }
      this.push(null);
    },
  }) as Readable & { method?: string; url?: string };
  req.method = method;
  req.url = url;
  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      callback();
    },
  }) as Writable & {
    statusCode: number;
    setHeader(name: string, value: string): void;
  };
  res.statusCode = 200;
  res.setHeader = () => {};

  const finished = new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
  });
  server.emit("request", req, res);
  await finished;
  return {
    statusCode: res.statusCode,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
  };
}

function parseSseBlock(block: string): { id: number | null; event: string; data: unknown } {
  let id: number | null = null;
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    const normalized = line.replace(/\r$/, "");
    if (normalized.startsWith("id:")) {
      const parsed = Number(normalized.slice("id:".length).trim());
      id = Number.isInteger(parsed) ? parsed : null;
      continue;
    }
    if (normalized.startsWith("event:")) {
      event = normalized.slice("event:".length).trim() || "message";
      continue;
    }
    if (normalized.startsWith("data:")) {
      data += normalized.slice("data:".length).trim();
    }
  }
  return {
    id,
    event,
    data: data ? (JSON.parse(data) as unknown) : null,
  };
}

function openEventStream(
  server: ReturnType<typeof createAgentHttpServer>,
  url: string,
  headers: Record<string, string> = {},
) {
  let sent = false;
  let output = "";
  let consumed = 0;
  const req = new Readable({
    read() {
      if (sent) {
        return;
      }
      sent = true;
      this.push(null);
    },
  }) as Readable & {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  };
  req.method = "GET";
  req.url = url;
  req.headers = headers;
  const res = new Writable({
    write(chunk, _encoding, callback) {
      output += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      callback();
    },
  }) as Writable & {
    statusCode: number;
    setHeader(name: string, value: string): void;
  };
  res.statusCode = 200;
  res.setHeader = () => {};
  server.emit("request", req, res);

  return {
    statusCode(): number {
      return res.statusCode;
    },
    readEvents(): Array<{ id: number | null; event: string; data: unknown }> {
      const events: Array<{ id: number | null; event: string; data: unknown }> = [];
      while (true) {
        const boundary = output.indexOf("\n\n", consumed);
        if (boundary === -1) {
          return events;
        }
        const block = output.slice(consumed, boundary);
        consumed = boundary + 2;
        events.push(parseSseBlock(block));
      }
    },
    close(): void {
      req.emit("close");
    },
  };
}

function openPostEventStream(
  server: ReturnType<typeof createAgentHttpServer>,
  url: string,
  body: unknown,
) {
  let sent = false;
  let output = "";
  let consumed = 0;
  const req = new Readable({
    read() {
      if (sent) {
        return;
      }
      sent = true;
      this.push(JSON.stringify(body));
      this.push(null);
    },
  }) as Readable & {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  };
  req.method = "POST";
  req.url = url;
  req.headers = { "content-type": "application/json" };
  const res = new Writable({
    write(chunk, _encoding, callback) {
      output += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      callback();
    },
  }) as Writable & {
    statusCode: number;
    setHeader(name: string, value: string): void;
    flushHeaders(): void;
  };
  res.statusCode = 200;
  res.setHeader = () => {};
  res.flushHeaders = () => {};

  const finished = new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
  });
  server.emit("request", req, res);

  return {
    statusCode(): number {
      return res.statusCode;
    },
    async wait(): Promise<void> {
      await finished;
    },
    readEvents(): Array<{ id: number | null; event: string; data: unknown }> {
      const events: Array<{ id: number | null; event: string; data: unknown }> = [];
      while (true) {
        const boundary = output.indexOf("\n\n", consumed);
        if (boundary === -1) {
          return events;
        }
        const block = output.slice(consumed, boundary);
        consumed = boundary + 2;
        events.push(parseSseBlock(block));
      }
    },
  };
}

afterEach(async () => {
  delete process.env.MODEL_ID;
  delete process.env.AGENT_SKILLHUB_ROOTS;
  if (previousCwd) {
    process.chdir(previousCwd);
    previousCwd = "";
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("agent service", () => {
  it("creates and lists isolated sessions", () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const first = service.createSession();
    const second = service.createSession();
    const sessions = service.listSessions();
    expect(sessions).toHaveLength(2);
    expect(first.id).not.toBe(second.id);
    expect(sessions[0]?.id).toBe(first.id);
  });

  it("shares session state when multiple services use the same host", () => {
    const sharedDeps = {
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      notificationService: {
        add: async () => undefined,
        drain: async () => [],
      },
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      runtimeCoordinationService: {
        runAutonomyTick: async () => ({ ok: true, action: "idle" }),
        tickScheduler: async () => undefined,
      },
      runtimeServices: undefined,
      queryEngine: createLoopRunner(),
    } as unknown as ConstructorParameters<typeof AgentHost>[0];
    const host = new AgentHost(sharedDeps);
    const first = new AgentService(sharedDeps, host);
    const second = new AgentService(sharedDeps, host);

    const session = first.createSession();

    expect(second.listSessions().map((item) => item.id)).toEqual([session.id]);
  });

  it("shares one host-owned event stream across services using the same host", async () => {
    const sharedDeps = {
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      notificationService: {
        add: async () => undefined,
        drain: async () => [],
      },
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      runtimeCoordinationService: {
        runAutonomyTick: async () => ({ ok: true, action: "idle" }),
        tickScheduler: async () => undefined,
      },
      runtimeServices: undefined,
      queryEngine: createLoopRunner(),
    } as unknown as ConstructorParameters<typeof AgentHost>[0];
    const host = new AgentHost(sharedDeps);
    const first = new AgentService(sharedDeps, host);
    const second = new AgentService(sharedDeps, host);
    const firstEvents: Array<{ id: number; type: string }> = [];
    const secondEvents: Array<{ id: number; type: string }> = [];
    first.subscribeEvents((event) => firstEvents.push({ id: event.id, type: event.type }));
    second.subscribeEvents((event) => secondEvents.push({ id: event.id, type: event.type }));

    const session = first.createSession();
    await second.chat({ session_id: session.id, message: "shared-host" });

    expect(firstEvents).toEqual([
      { id: 0, type: "session.created" },
      { id: 1, type: "chat.started" },
      { id: 2, type: "chat.completed" },
    ]);
    expect(secondEvents).toEqual(firstEvents);
  });

  it("keeps chat history isolated per session", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const a = service.createSession();
    const b = service.createSession();

    const resultA = await service.chat({ session_id: a.id, message: "alpha" });
    const resultB = await service.chat({ session_id: b.id, message: "beta" });

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    expect(String(resultA.assistant)).toContain("alpha");
    expect(String(resultB.assistant)).toContain("beta");
    expect(String(resultA.assistant)).not.toContain("beta");
  });

  it("writes redacted audit events for chat lifecycle", async () => {
    await withAuditWorkspace();
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const session = service.createSession();

    await service.chat({
      session_id: session.id,
      message: "please handle token=sk-123456789012345678901234",
    });

    const events = await readAuditEvents({ sessionId: session.id, category: "session" });
    expect(events.map((event) => [event.action, event.outcome])).toEqual([
      ["chat", "started"],
      ["chat", "completed"],
    ]);
    expect(JSON.stringify(events)).not.toContain("sk-123456789012345678901234");
    expect(events[0]).toMatchObject({
      subject: session.id,
      metadata: {
        messageLength: 47,
      },
    });
  });

  it("surfaces target-aware tool metadata from the shared tool registration layer", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService({
        listToolMetadata: async () => [
          {
            name: "mcp__demo__echo_upper",
            description: "Echo upper",
            target: "mcp",
            replaySafe: "false",
            serverName: "demo",
            remoteName: "echo_upper",
          },
          {
            name: "read_file",
            description: "Read a file",
            target: "base",
            replaySafe: "true",
          },
        ],
      }),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });

    const tools = await service.toolsMetadata();

    expect(tools).toEqual([
      {
        name: "mcp__demo__echo_upper",
        description: "Echo upper",
        target: "mcp",
        replaySafe: "false",
        serverName: "demo",
        remoteName: "echo_upper",
      },
      {
        name: "read_file",
        description: "Read a file",
        target: "base",
        replaySafe: "true",
      },
    ]);
  });

  it("exposes bridge manifest, session transcript, and service events", async () => {
    const events: string[] = [];
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const unsubscribe = service.subscribeEvents((event) => {
      events.push(event.type);
    });

    const session = service.createSession();
    await service.chat({ session_id: session.id, message: "bridge" });
    unsubscribe();
    const transcript = service.getSessionDetail(session.id);

    expect(service.bridgeManifest()).toMatchObject({
      ok: true,
      capabilities: { events: true, sessions: true, bridgeState: true, eventReplay: true },
      endpoints: {
        bridgeState: "/bridge/state",
        events: "/events",
        sessionDetail: "/sessions/:id",
        toolCall: "/tools/call",
      },
    });
    expect(transcript).toMatchObject({
      id: session.id,
      messages: [
        { role: "user", content: "bridge" },
        { role: "assistant" },
      ],
    });
    expect(events).toEqual(["session.created", "chat.started", "chat.completed"]);
  });

  it("reports bridge state with session and event cursor metadata", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const session = service.createSession();
    await service.chat({ session_id: session.id, message: "state" });

    expect(service.bridgeState()).toMatchObject({
      ok: true,
      ready: true,
      session_count: 1,
      sessions: [{ id: session.id, messageCount: 2 }],
      latest_event_id: 2,
      oldest_event_id: 0,
      buffered_event_count: 3,
      capabilities: {
        bridgeState: true,
        eventReplay: true,
      },
    });
  });

  it("serves bridge and session detail endpoints", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const session = service.createSession();
    const server = createAgentHttpServer(service);

    const bridge = await requestServer(server, "GET", "/bridge");
    const state = await requestServer(server, "GET", "/bridge/state");
    const detail = await requestServer(server, "GET", `/sessions/${session.id}`);
    const missing = await requestServer(server, "GET", "/sessions/missing");

    expect(bridge.body).toMatchObject({
      ok: true,
      name: "agent-cli-bridge",
      endpoints: { bridgeState: "/bridge/state" },
    });
    expect(state.body).toMatchObject({
      ok: true,
      ready: true,
      session_count: 1,
      latest_event_id: 0,
      oldest_event_id: 0,
      buffered_event_count: 1,
      sessions: [{ id: session.id }],
    });
    expect(detail.body).toMatchObject({ ok: true, session: { id: session.id, messages: [] } });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toMatchObject({
      ok: false,
      error: { code: "SESSION_NOT_FOUND" },
    });
  });

  it("accepts and returns agent runtime context on session and chat endpoints", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const server = createAgentHttpServer(service);
    const firstAgent = {
      id: "agent-alpha",
      name: "Alpha Agent",
      skills: [],
    };
    const nextAgent = {
      id: "agent-beta",
      name: "Beta Agent",
      skills: [],
    };

    const created = await requestServer(server, "POST", "/sessions", { agent: firstAgent });
    const session = created.body.session as { id?: unknown };
    const sessionId = String(session.id ?? "");
    const listed = await requestServer(server, "GET", "/sessions");
    const detail = await requestServer(server, "GET", `/sessions/${sessionId}`);
    const chat = await requestServer(server, "POST", "/chat", {
      session_id: sessionId,
      message: "hello",
      agent: nextAgent,
    });
    const updatedDetail = await requestServer(server, "GET", `/sessions/${sessionId}`);

    expect(created).toMatchObject({
      statusCode: 201,
      body: { ok: true, session: { id: sessionId, agent: firstAgent } },
    });
    expect(listed.body).toMatchObject({
      ok: true,
      sessions: [{ id: sessionId, agent: firstAgent }],
    });
    expect(detail.body).toMatchObject({
      ok: true,
      session: { id: sessionId, agent: firstAgent, messages: [] },
    });
    expect(chat.body).toMatchObject({
      ok: true,
      session: { id: sessionId, agent: nextAgent },
    });
    expect(updatedDetail.body).toMatchObject({
      ok: true,
      session: { id: sessionId, agent: nextAgent },
    });
  });

  it("injects version-bound agent skills into the query prompt source", async () => {
    const skillHubRoot = await mkdtemp(path.join(tmpdir(), "agent-service-skillhub-"));
    tempDir = skillHubRoot;
    process.env.AGENT_SKILLHUB_ROOTS = skillHubRoot;
    await writeSkillHubPackage(
      skillHubRoot,
      "remote",
      "remote-review",
      "1.2.0",
      [
        "---",
        "name: remote-review",
        "description: Review remotely.",
        "---",
        "",
        "Use exact remote version for ${SESSION_ID}.",
      ].join("\n"),
    );
    const runInputs: QueryEngineRunInput[] = [];
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: { ...PROMPT_SOURCE, skills: ["global skill should be replaced"] },
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner((input) => runInputs.push(input)),
    });
    const session = service.createSession({
      id: "agent-alpha",
      name: "Alpha Agent",
      skills: [{ skillId: "remote-review", version: "1.2.0", sourceType: "remote", registrySource: "official" }],
    });

    const result = await service.chat({ session_id: session.id, message: "use skill" });

    expect(result.ok).toBe(true);
    expect(runInputs).toHaveLength(1);
    expect(runInputs[0]?.promptSource?.skills).toHaveLength(1);
    expect(runInputs[0]?.promptSource?.skills[0]).toContain("### remote-review");
    expect(runInputs[0]?.promptSource?.skills[0]).toContain(`Use exact remote version for ${session.id}.`);
    expect(runInputs[0]?.promptSource?.skills[0]).not.toContain("global skill should be replaced");
  });

  it("resolves agent skill bindings without exposing full skill content", async () => {
    const skillHubRoot = await mkdtemp(path.join(tmpdir(), "agent-service-skillhub-"));
    tempDir = skillHubRoot;
    process.env.AGENT_SKILLHUB_ROOTS = skillHubRoot;
    await writeSkillHubPackage(
      skillHubRoot,
      "remote",
      "remote-review",
      "1.2.0",
      ["---", "name: remote-review", "description: Review remotely.", "---", "", "Private preflight body."].join("\n"),
    );
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const server = createAgentHttpServer(service);

    const result = await requestServer(server, "POST", "/skills/resolve", {
      agent: {
        id: "agent-alpha",
        name: "Alpha Agent",
        skills: [{ skillId: "remote-review", version: "1.2.0", sourceType: "remote", registrySource: "official" }],
      },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      agent: { id: "agent-alpha" },
      skills: [{ name: "remote-review", sourceType: "remote", contentLength: "Private preflight body.".length }],
    });
    expect(JSON.stringify(result.body)).not.toContain("Private preflight body.");
  });

  it("reports preflight binding failures before query runtime", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const server = createAgentHttpServer(service);

    const result = await requestServer(server, "POST", "/skills/resolve", {
      agent: {
        id: "agent-alpha",
        name: "Alpha Agent",
        skills: [{ skillId: "missing-skill", version: "1.0.0", sourceType: "remote", registrySource: "official" }],
      },
    });
    const invalid = await requestServer(server, "POST", "/skills/resolve", { agent: {} });

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: "AGENT_SKILL_LOAD_FAILED",
        details: [{ skillId: "missing-skill", code: "SKILL_PACKAGE_NOT_FOUND" }],
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).toMatchObject({ ok: false, error: { code: "INVALID_AGENT_CONTEXT" } });
  });

  it("returns a structured error and skips the query runtime when a bound skill is missing", async () => {
    const runInputs: QueryEngineRunInput[] = [];
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner((input) => runInputs.push(input)),
    });
    const session = service.createSession({
      id: "agent-alpha",
      name: "Alpha Agent",
      skills: [{ skillId: "missing-skill", version: "1.0.0", sourceType: "remote", registrySource: "official" }],
    });

    const result = await service.chat({ session_id: session.id, message: "use missing skill" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "AGENT_SKILL_LOAD_FAILED",
        details: [
          {
            skillId: "missing-skill",
            version: "1.0.0",
            sourceType: "remote",
            code: "SKILL_PACKAGE_NOT_FOUND",
          },
        ],
      },
      session: { id: session.id },
    });
    expect(runInputs).toEqual([]);
  });

  it("keeps the global prompt source when chat has no agent context", async () => {
    const runInputs: QueryEngineRunInput[] = [];
    const promptSource = { ...PROMPT_SOURCE, skills: ["global skill stays active"] };
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner((input) => runInputs.push(input)),
    });
    const session = service.createSession();

    const result = await service.chat({ session_id: session.id, message: "no agent" });

    expect(result.ok).toBe(true);
    expect(runInputs).toHaveLength(1);
    expect(runInputs[0]?.promptSource).toMatchObject({ skills: ["global skill stays active"] });
  });

  it("replays buffered events before continuing live /events delivery", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const first = service.createSession();
    const server = createAgentHttpServer(service);
    const stream = openEventStream(server, "/events?since_id=-1");

    expect(stream.statusCode()).toBe(200);
    expect(stream.readEvents()).toMatchObject([
      {
        id: null,
        event: "bridge.ready",
        data: {
          ok: true,
          replay_from: -1,
          bridge: {
            latest_event_id: 0,
            buffered_event_count: 1,
          },
        },
      },
      {
        id: 0,
        event: "session.created",
        data: {
          id: 0,
          type: "session.created",
          payload: { session: { id: first.id } },
        },
      },
    ]);

    const second = service.createSession();

    expect(stream.readEvents()).toMatchObject([
      {
        id: 1,
        event: "session.created",
        data: {
          id: 1,
          type: "session.created",
          payload: { session: { id: second.id } },
        },
      },
    ]);

    stream.close();
  });

  it("replays buffered events from Last-Event-ID headers", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    service.createSession();
    const second = service.createSession();
    const server = createAgentHttpServer(service);
    const stream = openEventStream(server, "/events", { "last-event-id": "0" });

    expect(stream.statusCode()).toBe(200);
    expect(stream.readEvents()).toMatchObject([
      {
        id: null,
        event: "bridge.ready",
        data: {
          ok: true,
          replay_from: 0,
        },
      },
      {
        id: 1,
        event: "session.created",
        data: {
          id: 1,
          type: "session.created",
          payload: { session: { id: second.id } },
        },
      },
    ]);

    stream.close();
  });

  it("serves remote tool call requests through the shared tool service", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService({
        runToolByName: async (name: string, argumentsJson: string) => `tool:${name}:${argumentsJson}`,
      }),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const server = createAgentHttpServer(service);

    const called = await requestServer(server, "POST", "/tools/call", {
      name: "bash",
      arguments_json: "{\"command\":\"pwd\"}",
    });

    expect(called.statusCode).toBe(200);
    expect(called.body).toMatchObject({
      ok: true,
      output: "tool:bash:{\"command\":\"pwd\"}",
    });
  });

  it("streams chat deltas from the query runner over /chat/stream", async () => {
    const service = new AgentService({
      client: {} as OpenAI,
      model: "fake-model",
      promptSource: PROMPT_SOURCE,
      toolService: createToolService(),
      deliveryService: createDeliveryService(),
      hookService: createHookService(),
      memoryService: createMemoryService(),
      modelPolicyService: createModelPolicyService(),
      observabilityService: createObservabilityService(),
      queryEngine: createLoopRunner(),
    });
    const session = service.createSession();
    const server = createAgentHttpServer(service);

    const stream = openPostEventStream(server, "/chat/stream", {
      session_id: session.id,
      message: "delta",
    });
    await stream.wait();

    expect(stream.statusCode()).toBe(200);
    expect(stream.readEvents()).toMatchObject([
      { event: "message.start", data: { session_id: session.id } },
      { event: "message.delta", data: { delta: "reply:" } },
      { event: "message.delta", data: { delta: session.id } },
      { event: "message.delta", data: { delta: ":" } },
      { event: "message.delta", data: { delta: "delta" } },
      { event: "message.done", data: { ok: true, assistant: `reply:${session.id}:delta` } },
    ]);
  });
});
