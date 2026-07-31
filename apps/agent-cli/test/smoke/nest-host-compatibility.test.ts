import type { AddressInfo } from "node:net";
import { request } from "node:http";
import { Mastra } from "@mastra/core/mastra";
import type {
  AgentRuntimePort,
  MemoryRuntimePort,
  RuntimeGateway,
  ToolExecutionPort,
  WorkflowRuntimePort,
} from "@orbit/runtime-contracts";
import type { WorkflowRunSnapshot } from "@orbit/workflow-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNestAgentHttpServer } from "../../src/nest/server.js";
import type { AgentService } from "../../src/service-api/index.js";
import type { AgentServerLike } from "../../src/service-api/server.js";

const servers: AgentServerLike[] = [];

function workflowRun(status: WorkflowRunSnapshot["status"] = "running"): WorkflowRunSnapshot {
  return {
    id: "workflow-run-1",
    workflowId: "workflow-1",
    mode: "draft",
    status,
    createdAt: 1,
    inputs: {},
    nodeRuns: {},
  };
}

function createRuntimeGateway(): RuntimeGateway {
  const agent: AgentRuntimePort = {
    capabilities: async () => ({
      generate: true,
      stream: true,
      eventReplay: true,
      runQuery: true,
      cancel: true,
      toolEvents: true,
      usage: true,
      sessionMemory: true,
    }),
    generate: async (command) => ({
      id: command.runId ?? "agent-run-1",
      status: "succeeded",
      createdAt: 1,
      finishedAt: 2,
      sessionId: command.sessionId,
      resourceId: command.resourceId,
      threadId: command.threadId,
      binding: { backend: "mastra", adapterVersion: "test" },
      text: "agent-result",
      toolExecutions: [],
    }),
    stream: async function* (command) {
      yield { id: 0, runId: command.runId ?? "agent-run-1", at: 1, type: "text.delta", delta: "agent-result" };
    },
    getRun: async (runId) => ({
      id: runId,
      status: "running",
      createdAt: 1,
      sessionId: "session-1",
      resourceId: "resource-1",
      threadId: "thread-1",
      binding: { backend: "mastra", adapterVersion: "test" },
    }),
    cancel: async ({ runId }) => ({
      id: runId,
      status: "cancelled",
      createdAt: 1,
      finishedAt: 2,
      sessionId: "session-1",
      resourceId: "resource-1",
      threadId: "thread-1",
      binding: { backend: "mastra", adapterVersion: "test" },
    }),
  };
  const workflow: WorkflowRuntimePort = {
    capabilities: async () => ({
      start: true,
      query: true,
      cancel: true,
      events: true,
      eventReplay: true,
      resume: true,
      snapshots: true,
      restartRecovery: true,
    }),
    start: async () => workflowRun(),
    get: async (runId) => runId === "missing" ? null : { ...workflowRun(), id: runId },
    cancel: async () => workflowRun("cancelled"),
    events: async function* ({ runId }) {
      yield { id: 1, runId, at: 2, type: "run.status", status: "succeeded" };
    },
    resume: async () => workflowRun("running"),
  };
  const tools: ToolExecutionPort = {
    list: async () => [],
    execute: async (command) => ({
      toolId: command.toolId,
      output: `tool:${command.toolId}:${JSON.stringify(command.input)}`,
      startedAt: 1,
      finishedAt: 2,
    }),
  };
  const memory: MemoryRuntimePort = {
    createThread: async (command) => ({
      id: command.id ?? "thread-1",
      ownerId: command.ownerId,
      resourceId: command.resourceId,
      title: command.title,
      metadata: command.metadata ?? {},
      createdAt: 1,
      updatedAt: 1,
    }),
    getThread: async (query) => ({
      id: query.threadId,
      ownerId: query.ownerId,
      resourceId: query.resourceId,
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
    }),
    listThreads: async () => ({ items: [], nextCursor: null }),
    deleteThread: async () => undefined,
    listMessages: async () => ({ items: [], nextCursor: null }),
    appendMessages: async () => undefined,
  };
  return { agent, workflow, tools, memory };
}

function createService(): AgentService {
  const runtimeGateway = createRuntimeGateway();
  const session = {
    id: "session-1",
    createdAt: 1,
    updatedAt: 1,
    busy: false,
    history: [],
    rounds: 0,
    agent: null,
    runtimeBinding: { backend: "mastra", adapterVersion: "test" },
  };
  return {
    runtimeGateway,
    workflowRuntime: runtimeGateway.workflow,
    runtimeInfo: async () => ({ mode: "mastra-only" }),
    bridgeManifest: () => ({ ok: true, name: "agent-cli-bridge" }),
    bridgeState: () => ({ ok: true, ready: true, session_count: 1 }),
    replayEventsSince: () => [{ id: 0, at: 1, type: "session.created", payload: { session } }],
    subscribeEvents: () => () => undefined,
    listSessions: () => [session],
    createSession: () => session,
    getSessionDetail: (sessionId: string) => sessionId === session.id ? session : null,
    resolveAgentSkills: () => ({ ok: true, skills: [] }),
    toolsMetadata: async () => [{ name: "echo" }],
    runToolByName: async (name: string, argumentsJson: string) => `tool:${name}:${argumentsJson}`,
    chat: async (
      input: { session_id?: string },
      callbacks: { onAssistantDelta?: (delta: string) => void | Promise<void> } = {},
    ) => {
      await callbacks.onAssistantDelta?.("reply");
      return { ok: true, assistant: "reply", session: { ...session, id: input.session_id ?? session.id } };
    },
  } as unknown as AgentService;
}

async function listen(server: AgentServerLike): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address?.();
  if (!address || typeof address === "string") throw new Error("server did not expose a TCP address");
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

async function requestJson(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function firstSseChunk(
  baseUrl: string,
  path: string,
  marker: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(`${baseUrl}${path}`, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        text += chunk;
        if (!text.includes(marker)) return;
        resolve({ status: res.statusCode ?? 0, text });
        res.destroy();
        req.destroy();
      });
      res.once("end", () => {
        if (!text.includes(marker)) reject(new Error(`SSE ended before marker ${marker}: ${text}`));
      });
      res.once("error", (error) => {
        if (!text.includes(marker)) reject(error);
      });
    });
    req.once("error", reject);
    req.end();
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("Nest Agent host compatibility", () => {
  it("keeps existing Orbit product routes on the Nest host", async () => {
    const service = createService();
    const nestBase = await listen(await createNestAgentHttpServer(service, { mastra: new Mastra({}) }));
    const cases: Array<[string, RequestInit | undefined, number]> = [
      ["/health", undefined, 200],
      ["/bridge", undefined, 200],
      ["/bridge/state", undefined, 200],
      ["/tools", undefined, 200],
      ["/sessions", undefined, 200],
      ["/sessions/session-1", undefined, 200],
      ["/skills/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, 200],
      ["/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: "session-1", message: "hello" }) }, 200],
      ["/tools/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "echo", arguments_json: "{}" }) }, 200],
      ["/workflow-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflow: { id: "workflow-1" }, mode: "draft" }) }, 201],
      ["/workflow-runs/workflow-run-1", undefined, 200],
      ["/workflow-runs/missing", undefined, 404],
      ["/workflow-runs/workflow-run-1/cancel", { method: "POST" }, 202],
      ["/workflow-runs/workflow-run-1/resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step_id: "approval", resume_data: { approved: true } }) }, 200],
      ["/missing-route", undefined, 404],
    ];
    for (const [path, init, status] of cases) {
      const response = await requestJson(nestBase, path, init);
      expect(response, path).toMatchObject({ status });
    }
  });

  it("keeps Agent and Workflow SSE framing stable and leaves Orbit routes ahead of Mastra catch-all", async () => {
    const service = createService();
    const nestBase = await listen(await createNestAgentHttpServer(service, { mastra: new Mastra({}) }));
    const nestEvents = await firstSseChunk(nestBase, "/events?since_id=-1", "event: session.created");
    expect(nestEvents).toMatchObject({ status: 200 });
    expect(nestEvents.text).toContain("id: 0");
    expect(nestEvents.text).toContain("event: session.created");
    const nestWorkflow = await firstSseChunk(nestBase, "/workflow-runs/workflow-run-1/events?since_id=0", "event: run.status");
    expect(nestWorkflow).toMatchObject({ status: 200 });
    expect(nestWorkflow.text).toContain("id: 1");
    expect(nestWorkflow.text).toContain("event: run.status");
    await expect(requestJson(nestBase, "/workflow-runs/workflow-run-1")).resolves.toMatchObject({
      status: 200,
      body: { ok: true, run: { id: "workflow-run-1" } },
    });
    const mastraResponse = await fetch(`${nestBase}/internal/mastra/agents`);
    expect(mastraResponse.status).toBe(200);
  });

  it("exposes Orbit ready/info, Agent run, and Memory Port routes on the Nest host", async () => {
    const service = createService();
    const baseUrl = await listen(await createNestAgentHttpServer(service, { mastra: new Mastra({}) }));
    await expect(requestJson(baseUrl, "/ready")).resolves.toMatchObject({ status: 200, body: { ok: true, ready: true } });
    await expect(requestJson(baseUrl, "/info")).resolves.toMatchObject({ status: 200, body: { ok: true, name: "agent-cli" } });
    await expect(requestJson(baseUrl, "/internal/runtime/legacy")).resolves.toMatchObject({ status: 404 });
    await expect(requestJson(baseUrl, "/internal/runtime/legacy/drain", { method: "POST" })).resolves.toMatchObject({ status: 404 });
    await expect(requestJson(baseUrl, "/agent-runs/agent-run-1")).resolves.toMatchObject({ status: 200, body: { ok: true } });
    await expect(requestJson(baseUrl, "/memory/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_id: "owner-1", resource_id: "resource-1", id: "thread-1" }),
    })).resolves.toMatchObject({ status: 201, body: { ok: true, thread: { id: "thread-1" } } });
  });

  it("closes Orbit SSE before flushing the Mastra runtime during graceful shutdown", async () => {
    const cleanupMastra = vi.fn(async () => undefined);
    const server = await createNestAgentHttpServer(createService(), {
      mastra: new Mastra({}),
      cleanupMastra,
    });
    const baseUrl = await listen(server);
    let closeDone: Promise<void> | null = null;
    const shutdownEvent = new Promise<string>((resolve, reject) => {
      const req = request(`${baseUrl}/events?since_id=-1`, (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          text += chunk;
          if (text.includes("event: session.created") && !closeDone) {
            closeDone = new Promise<void>((closeResolve, closeReject) => {
              server.close((error) => error ? closeReject(error) : closeResolve());
            });
          }
          if (text.includes("event: shutdown") && text.includes("Server is shutting down")) resolve(text);
        });
        res.once("error", reject);
      });
      req.once("error", reject);
      req.end();
    });
    await expect(shutdownEvent).resolves.toContain("Server is shutting down");
    await closeDone;
    expect(cleanupMastra).toHaveBeenCalledTimes(1);
  });
});
